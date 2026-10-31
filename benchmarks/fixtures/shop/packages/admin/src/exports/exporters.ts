export type Row = Record<string, string | number>;

export abstract class ReportExporter {
  abstract export(rows: Row[]): string;
}

export class CsvExporter extends ReportExporter {
  export(rows: Row[]): string {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]!);
    const body = rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
    return [headers.join(","), ...body].join("\n");
  }
}

export class JsonExporter extends ReportExporter {
  export(rows: Row[]): string {
    if (rows.length === 0) return "[]";
    const headers = Object.keys(rows[0]!);
    const body = rows.map((row) => Object.fromEntries(headers.map((h) => [h, row[h] ?? ""])));
    return JSON.stringify(body, null, 2);
  }
}
