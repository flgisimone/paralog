import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";
import {
  Node,
  Project,
  ts,
  type ArrowFunction,
  type CallExpression,
  type ClassDeclaration,
  type ClassExpression,
  type ConstructorDeclaration,
  type FunctionDeclaration,
  type FunctionExpression,
  type GetAccessorDeclaration,
  type MethodDeclaration,
  type NewExpression,
  type ObjectLiteralExpression,
  type SetAccessorDeclaration,
  type SourceFile,
  type Type,
  type TypeChecker,
} from "ts-morph";
import { loadConfig, type ParalogConfig } from "./config.js";
import { discoverProjects, toPosix, type Discovery } from "./discovery.js";

/** Bumped whenever the extracted data changes, so that caches built by older versions are discarded. */
export const EXTRACTOR_VERSION = 1;

export type UnitKind = "function" | "arrow" | "method" | "getter" | "setter" | "constructor";

/** A function-like piece of code paralog compares with the others. */
export interface CodeUnit {
  /** `<file>#<qualified name>:<kind>`; does not depend on line numbers. */
  readonly id: string;
  /** Qualified name, e.g. `UserService.deactivate`. */
  readonly name: string;
  readonly kind: UnitKind;
  /** Path relative to the root, with forward slashes. */
  readonly file: string;
  /** 1-based, inclusive. */
  readonly startLine: number;
  readonly endLine: number;
  /** e.g. `deactivate(user: User, reason?: string): Promise<void>` */
  readonly signature: string;
  readonly paramTypes: readonly string[];
  readonly returnType: string;
  /** Properties read or written, qualified by the type that declares them (`User.status`). Project types only. */
  readonly touchedProperties: readonly string[];
  /** Called functions: unit ids for project code, `<package>#<name>` for dependencies, `<name>` for globals. */
  readonly calls: readonly string[];
  /** Non-trivial literals: strings as JSON (`"USER_NOT_FOUND"`), numbers as text (`30`). */
  readonly literals: readonly string[];
  /** Interface or base-class members this unit implements or overrides (`PaymentMethod.charge`). */
  readonly implements: readonly string[];
  /** Number of statements in the body (an expression body counts as one). */
  readonly statements: number;
  /** Hash of the unit's tokens: ignores comments, whitespace and position. */
  readonly bodyHash: string;
}

export interface ExtractOptions {
  /** Repository root. */
  readonly root: string;
  /** Defaults to `paralog.config.json` in the root, or the defaults. */
  readonly config?: ParalogConfig;
}

export interface Extraction {
  readonly discovery: Discovery;
  /** Sorted by id. */
  readonly units: readonly CodeUnit[];
}

type FunctionLike =
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunction
  | MethodDeclaration
  | GetAccessorDeclaration
  | SetAccessorDeclaration
  | ConstructorDeclaration;

const TYPE_FLAGS: ts.TypeFormatFlags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
const TRIVIAL_NUMBERS = new Set(["0", "1", "2"]);
const MIN_STRING_LENGTH = 3;

/** Name contributed by a node to a qualified name; `undefined` when the node does not contribute. */
function ownName(node: Node): string | undefined {
  const parent = node.getParent();
  if (Node.isFunctionDeclaration(node)) return node.getName() ?? "default";
  if (Node.isClassDeclaration(node)) return node.getName() ?? "default";
  if (Node.isClassExpression(node)) {
    return parent !== undefined && Node.isVariableDeclaration(parent) ? undefined : (node.getName() ?? "anonymous");
  }
  if (Node.isConstructorDeclaration(node)) return "constructor";
  if (Node.isExportAssignment(node)) return "default";
  if (
    Node.isMethodDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node) ||
    Node.isPropertyDeclaration(node) ||
    Node.isPropertyAssignment(node) ||
    Node.isShorthandPropertyAssignment(node) ||
    Node.isMethodSignature(node) ||
    Node.isPropertySignature(node) ||
    Node.isEnumMember(node)
  ) {
    const nameNode = node.getNameNode();
    if (Node.isComputedPropertyName(nameNode)) return `[${nameNode.getExpression().getText()}]`;
    if (Node.isStringLiteral(nameNode) || Node.isNoSubstitutionTemplateLiteral(nameNode)) {
      return nameNode.getLiteralValue();
    }
    return nameNode.getText();
  }
  if (Node.isVariableDeclaration(node)) {
    const nameNode = node.getNameNode();
    return Node.isIdentifier(nameNode) ? nameNode.getText() : undefined;
  }
  if (
    Node.isModuleDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isTypeAliasDeclaration(node) ||
    Node.isEnumDeclaration(node)
  ) {
    return node.getName();
  }
  return undefined;
}

/** Qualified name of a declaration, e.g. `Billing.InvoiceService.total` or `userService.deactivate`. */
export function qualifiedName(node: Node): string {
  const parts: string[] = [];
  for (let current: Node | undefined = node; current !== undefined; current = current.getParent()) {
    if (Node.isSourceFile(current)) break;
    const name = ownName(current);
    if (name !== undefined) parts.push(name);
  }
  return parts.reverse().join(".");
}

function unitKind(node: FunctionLike): UnitKind {
  if (Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node)) return "function";
  if (Node.isArrowFunction(node)) return "arrow";
  if (Node.isMethodDeclaration(node)) return "method";
  if (Node.isGetAccessorDeclaration(node)) return "getter";
  if (Node.isSetAccessorDeclaration(node)) return "setter";
  return "constructor";
}

function unwrap(node: Node | undefined): Node | undefined {
  let current = node;
  while (
    current !== undefined &&
    (Node.isAsExpression(current) ||
      Node.isSatisfiesExpression(current) ||
      Node.isParenthesizedExpression(current) ||
      Node.isTypeAssertion(current))
  ) {
    current = current.getExpression();
  }
  return current;
}

/** Collects the function-like nodes that become units; function bodies are not entered. */
function collectFunctions(sourceFile: SourceFile): FunctionLike[] {
  const found: FunctionLike[] = [];

  const fromValue = (value: Node | undefined): void => {
    const node = unwrap(value);
    if (node === undefined) return;
    if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) found.push(node);
    else if (Node.isObjectLiteralExpression(node)) fromObjectLiteral(node);
    else if (Node.isClassExpression(node)) fromClass(node);
  };

  const fromObjectLiteral = (object: ObjectLiteralExpression): void => {
    for (const property of object.getProperties()) {
      if (Node.isMethodDeclaration(property) || Node.isGetAccessorDeclaration(property) || Node.isSetAccessorDeclaration(property)) {
        if (property.hasBody()) found.push(property);
      } else if (Node.isPropertyAssignment(property)) {
        fromValue(property.getInitializer());
      }
    }
  };

  const fromClass = (cls: ClassDeclaration | ClassExpression): void => {
    for (const member of cls.getMembers()) {
      if (
        Node.isMethodDeclaration(member) ||
        Node.isGetAccessorDeclaration(member) ||
        Node.isSetAccessorDeclaration(member) ||
        Node.isConstructorDeclaration(member)
      ) {
        if (member.hasBody()) found.push(member);
      } else if (Node.isPropertyDeclaration(member)) {
        fromValue(member.getInitializer());
      }
    }
  };

  const fromStatements = (statements: readonly Node[]): void => {
    for (const statement of statements) {
      if (Node.isFunctionDeclaration(statement)) {
        if (statement.hasBody()) found.push(statement);
      } else if (Node.isClassDeclaration(statement)) {
        fromClass(statement);
      } else if (Node.isVariableStatement(statement)) {
        for (const declaration of statement.getDeclarations()) fromValue(declaration.getInitializer());
      } else if (Node.isModuleDeclaration(statement)) {
        fromStatements(statement.getStatements());
      } else if (Node.isExportAssignment(statement)) {
        fromValue(statement.getExpression());
      }
    }
  };

  fromStatements(sourceFile.getStatements());
  return found;
}

function typeText(type: Type, enclosing: Node): string {
  // Types not reachable from the enclosing scope print as import("/absolute/path").Name: keep the name only.
  return type.getText(enclosing, TYPE_FLAGS).replace(/import\("[^"]*"\)\./g, "");
}

function isProjectDeclaration(node: Node): boolean {
  const sourceFile = node.getSourceFile();
  return !sourceFile.isFromExternalLibrary() && !sourceFile.isInNodeModules() && !sourceFile.isDeclarationFile();
}

/** Name of the npm package a declaration file belongs to, if any. */
function packageName(sourceFile: SourceFile): string | undefined {
  const path = toPosix(sourceFile.getFilePath());
  // TypeScript's own lib files (lib.es2022.d.ts, lib.dom.d.ts) declare globals, not a package.
  if (/\/typescript\/lib\/lib\.[^/]*\.d\.ts$/.test(path)) return undefined;
  const match = /\/node_modules\/((?:@[^/]+\/)?[^/]+)\/(?!.*\/node_modules\/)/.exec(path);
  if (match?.[1] === undefined) return undefined;
  return match[1].startsWith("@types/") ? match[1].slice("@types/".length).replace("__", "/") : match[1];
}

interface UnitContext {
  readonly root: string;
  readonly checker: TypeChecker;
}

function isObjectLiteralMember(node: Node): boolean {
  return (
    Node.isPropertyAssignment(node) ||
    Node.isShorthandPropertyAssignment(node) ||
    (Node.isMethodDeclaration(node) && Node.isObjectLiteralExpression(node.getParent()))
  );
}

function isFunctionBody(node: Node): boolean {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isFunctionExpression(node) ||
    Node.isArrowFunction(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node) ||
    Node.isConstructorDeclaration(node)
  );
}

/** Owner-qualified names of the declarations of a property, restricted to project code. */
function propertyOwners(declarations: readonly Node[]): string[] {
  return declarations
    .filter(isProjectDeclaration)
    .map((d) => {
      // constructor(private readonly repo: Repo) declares UserService.repo
      if (Node.isParameterDeclaration(d) && d.isParameterProperty()) {
        const cls = d.getParentOrThrow().getParentOrThrow();
        return `${qualifiedName(cls)}.${d.getName()}`;
      }
      // Members of object literals built inside a function are local values, not domain properties.
      if (isObjectLiteralMember(d) && d.getFirstAncestor(isFunctionBody) !== undefined) return "";
      return qualifiedName(d);
    })
    .filter((name) => name.includes("."));
}

function propertiesOf(type: Type | undefined, name: string): string[] {
  if (type === undefined) return [];
  const symbol = type.getProperty(name) ?? type.getApparentType().getProperty(name);
  return symbol === undefined ? [] : propertyOwners(symbol.getDeclarations());
}

function functionLikeAt(node: Node): FunctionLike | undefined {
  if (
    Node.isFunctionDeclaration(node) ||
    Node.isFunctionExpression(node) ||
    Node.isArrowFunction(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node) ||
    Node.isConstructorDeclaration(node)
  ) {
    return node;
  }
  if (Node.isVariableDeclaration(node) || Node.isPropertyDeclaration(node) || Node.isPropertyAssignment(node)) {
    const value = unwrap(node.getInitializer());
    if (value !== undefined && (Node.isArrowFunction(value) || Node.isFunctionExpression(value))) return value;
  }
  return undefined;
}

function unitIdOf(root: string, node: FunctionLike): string {
  const file = toPosix(relative(root, node.getSourceFile().getFilePath()));
  return `${file}#${qualifiedName(node)}:${unitKind(node)}`;
}

/** Stable identifier of a call target. */
function callTarget(ctx: UnitContext, call: CallExpression | NewExpression): string | undefined {
  let target: Node | undefined = ctx.checker.getResolvedSignature(call)?.getDeclaration();
  // `new Error()` resolves to a construct signature of ErrorConstructor: name the class instead.
  if (target !== undefined && (Node.isConstructSignatureDeclaration(target) || Node.isCallSignatureDeclaration(target))) {
    target = undefined;
  }
  if (target === undefined) {
    // Constructors without an explicit declaration, functions typed through a variable, etc.
    const symbol = call.getExpression().getSymbol();
    const aliased = symbol?.getAliasedSymbol() ?? symbol;
    target = aliased?.getDeclarations()[0];
  }
  if (target === undefined) return undefined;

  if (isProjectDeclaration(target)) {
    const fn = functionLikeAt(target);
    if (fn !== undefined) return unitIdOf(ctx.root, fn);
    const file = toPosix(relative(ctx.root, target.getSourceFile().getFilePath()));
    return `${file}#${qualifiedName(target)}`;
  }
  const name = qualifiedName(target);
  if (name === "") return undefined;
  const pkg = packageName(target.getSourceFile());
  // Globals are declared as `interface ObjectConstructor { assign(...) }`: print them as `Object.assign`.
  return pkg === undefined ? name.replace(/^(\w+)Constructor\./, "$1.") : `${pkg}#${name}`;
}

function isCallee(node: Node): boolean {
  const parent = node.getParent();
  return parent !== undefined && (Node.isCallExpression(parent) || Node.isNewExpression(parent)) && parent.getExpression() === node;
}

function literalOf(node: Node): string | undefined {
  const parent = node.getParent();
  if (parent !== undefined && (Node.isLiteralTypeNode(parent) || Node.isImportDeclaration(parent) || Node.isExportDeclaration(parent))) {
    return undefined;
  }
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    const value = node.getLiteralValue();
    return value.trim().length >= MIN_STRING_LENGTH ? JSON.stringify(value) : undefined;
  }
  if (Node.isTemplateHead(node) || Node.isTemplateMiddle(node) || Node.isTemplateTail(node)) {
    const value = node.compilerNode.text;
    return value.trim().length >= MIN_STRING_LENGTH ? JSON.stringify(value) : undefined;
  }
  if (Node.isNumericLiteral(node)) {
    const value = String(node.getLiteralValue());
    return TRIVIAL_NUMBERS.has(value) ? undefined : value;
  }
  return undefined;
}

/** Interface and base-class members a method implements or overrides. */
function implementedMembers(fn: FunctionLike): string[] {
  if (Node.isConstructorDeclaration(fn)) return [];
  const holder = Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) ? fn.getParent() : fn;
  const container = holder.getParent();
  const name = ownName(holder);
  if (container === undefined || name === undefined) return [];

  let types: Type[] = [];
  if (Node.isClassDeclaration(container) || Node.isClassExpression(container)) {
    types = [...container.getImplements().map((i) => i.getType()), ...container.getBaseTypes()];
  } else if (Node.isObjectLiteralExpression(container)) {
    const contextual = container.getContextualType();
    if (contextual !== undefined) types = [contextual];
  }
  const owners = types.flatMap((t) => propertiesOf(t, name));
  const own = qualifiedName(holder);
  return owners.filter((o) => o !== own);
}

function countStatements(fn: FunctionLike): number {
  const body = fn.getBody();
  if (body === undefined) return 0;
  if (!Node.isBlock(body)) return 1;
  let count = 0;
  body.forEachDescendant((node) => {
    if (Node.isStatement(node) && !Node.isBlock(node)) count++;
  });
  return count;
}

function hashTokens(node: ts.Node, sourceFile: ts.SourceFile): string {
  const hash = createHash("sha256");
  const visit = (n: ts.Node): void => {
    if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = n.getChildren(sourceFile);
    if (children.length === 0) {
      hash.update(n.getText(sourceFile));
      hash.update("\u0000");
    } else {
      children.forEach(visit);
    }
  };
  visit(node);
  return hash.digest("hex").slice(0, 16);
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function extractUnit(ctx: UnitContext, fn: FunctionLike): CodeUnit {
  const sourceFile = fn.getSourceFile();
  const name = qualifiedName(fn);
  const kind = unitKind(fn);
  const file = toPosix(relative(ctx.root, sourceFile.getFilePath()));

  const params = fn.getParameters().map((p) => {
    const optional = p.hasQuestionToken() || p.hasInitializer() ? "?" : "";
    const rest = p.isRestParameter() ? "..." : "";
    const paramName = Node.isIdentifier(p.getNameNode()) ? p.getName() : "_";
    let type = typeText(p.getType(), fn);
    if (optional !== "" && type.endsWith(" | undefined")) type = type.slice(0, -" | undefined".length);
    return { text: `${rest}${paramName}${optional}: ${type}`, type };
  });
  const returnType = Node.isConstructorDeclaration(fn) ? typeText(fn.getParentOrThrow().getType(), fn) : typeText(fn.getReturnType(), fn);
  const shortName = name.split(".").pop() ?? name;

  const touched: string[] = [];
  const calls: string[] = [];
  const literals: string[] = [];
  const visit = (node: Node): void => {
    if (Node.isPropertyAccessExpression(node)) {
      if (!isCallee(node)) touched.push(...propertyOwners(node.getNameNode().getSymbol()?.getDeclarations() ?? []));
    } else if (Node.isElementAccessExpression(node)) {
      const argument = node.getArgumentExpression();
      if (argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument))) {
        touched.push(...propertiesOf(node.getExpression().getType(), argument.getLiteralValue()));
      }
    } else if (Node.isBindingElement(node)) {
      const pattern = node.getParent();
      if (Node.isObjectBindingPattern(pattern)) {
        const propertyName = node.getPropertyNameNode()?.getText() ?? node.getName();
        touched.push(...propertiesOf(pattern.getType(), propertyName));
      }
    } else if (Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)) {
      const object = node.getParent();
      if (Node.isObjectLiteralExpression(object)) {
        const propertyName = ownName(node);
        if (propertyName !== undefined) touched.push(...propertiesOf(object.getContextualType(), propertyName));
      }
    } else if (Node.isCallExpression(node) || Node.isNewExpression(node)) {
      if (!Node.isCallExpression(node) || node.getExpression().getKind() !== ts.SyntaxKind.SuperKeyword) {
        const target = callTarget(ctx, node);
        if (target !== undefined) calls.push(target);
      }
    } else {
      const literal = literalOf(node);
      if (literal !== undefined) literals.push(literal);
    }
  };
  const body = fn.getBody();
  if (body !== undefined) {
    // An expression body (`=> new UserService(r)`) is itself part of the logic.
    if (!Node.isBlock(body)) visit(body);
    body.forEachDescendant(visit);
  }
  // A destructured parameter touches the properties it destructures.
  for (const parameter of fn.getParameters()) {
    const nameNode = parameter.getNameNode();
    if (Node.isObjectBindingPattern(nameNode)) {
      for (const element of nameNode.getElements()) {
        const propertyName = element.getPropertyNameNode()?.getText() ?? element.getName();
        touched.push(...propertiesOf(parameter.getType(), propertyName));
      }
    }
  }

  return {
    id: `${file}#${name}:${kind}`,
    name,
    kind,
    file,
    startLine: fn.getStartLineNumber(),
    endLine: fn.getEndLineNumber(),
    signature: `${shortName}(${params.map((p) => p.text).join(", ")}): ${returnType}`,
    paramTypes: params.map((p) => p.type),
    returnType,
    touchedProperties: sorted(touched),
    calls: sorted(calls),
    literals: sorted(literals),
    implements: sorted(implementedMembers(fn)),
    statements: countStatements(fn),
    bodyHash: hashTokens(fn.compilerNode, sourceFile.compilerNode),
  };
}

/** Extracts the units of the given files of one project. */
export function extractFromProject(root: string, project: Project, files: readonly string[]): CodeUnit[] {
  const ctx: UnitContext = { root, checker: project.getTypeChecker() };
  const units: CodeUnit[] = [];
  for (const file of files) {
    const absolute = resolve(root, file);
    const sourceFile = project.getSourceFile(absolute) ?? project.addSourceFileAtPath(absolute);
    for (const fn of collectFunctions(sourceFile)) units.push(extractUnit(ctx, fn));
  }
  return units;
}

/** Discovers the projects of a repository and extracts every unit. */
export function extractUnits(options: ExtractOptions): Extraction {
  const root = resolve(options.root);
  const config = options.config ?? loadConfig(root);
  const discovery = discoverProjects(root, config);
  const byId = new Map<string, CodeUnit>();

  for (const { tsconfig, files } of discovery.projects) {
    const project = new Project({ tsConfigFilePath: resolve(root, tsconfig), skipLoadingLibFiles: false });
    for (const unit of extractFromProject(root, project, files)) {
      // Same qualified name twice in a file (declaration merging, duplicate keys): keep both, suffixed.
      let id = unit.id;
      for (let n = 2; byId.has(id); n++) id = `${unit.id}~${n}`;
      byId.set(id, id === unit.id ? unit : { ...unit, id });
    }
  }
  const units = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { discovery, units };
}
