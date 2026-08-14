// tools/initial-import/import-films.mjs
import * as path from "node:path";

import {
  ImportValidationError,
  SOURCE_COLUMNS,
  analyzeSourceTable,
  parseCsv,
  resolveImportSecretKey,
} from "./import-core.mjs";

const EXCELJS_URL = "https://esm.sh/exceljs@4.4.0?target=deno";
const SUPABASE_URL =
  "https://esm.sh/@supabase/supabase-js@2.112.3?target=deno";
const SOURCE_BASENAME_PATTERN = /^Cage_Code_Importbereit.*\.(xlsx|csv)$/i;

try {
  const options = parseArguments(Deno.args);

  if (options.help) {
    printHelp();
    Deno.exit(0);
  }

  if (!options.input) {
    throw new Error("--input ist erforderlich. Nutze --help für Beispiele.");
  }

  const selectedInput = await resolveInput(options.input);
  const sourceTable = await loadSourceTable(selectedInput);
  const analysis = analyzeSourceTable(sourceTable, {
    expectedCount: options.expectedCount,
  });

  printPreview(selectedInput, analysis);

  if (!options.commit) {
    console.log("\nDRY-RUN: Es wurden keine Netzwerk- oder Datenbankschreibzugriffe ausgeführt.");
    console.log("Nach Prüfung erneut mit --commit starten.");
    Deno.exit(0);
  }

  if (analysis.conflicts.length > 0 && !options.acceptConflicts) {
    throw new Error(
      "Der Commit wurde wegen erkannter Statuskonflikte gestoppt. Nach manueller Prüfung zusätzlich --accept-conflicts setzen.",
    );
  }

  const result = await commitImport(analysis.records);
  printCommitResult(result);
} catch (error) {
  if (error instanceof ImportValidationError) {
    console.error(`\nIMPORT GESTOPPT: ${error.message}`);
    for (const issue of error.issues) {
      console.error(`- ${issue}`);
    }
    Deno.exit(1);
  }

  const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
  console.error(`\nIMPORT GESTOPPT: ${message}`);
  Deno.exit(1);
}

function parseArguments(args) {
  const options = {
    input: null,
    expectedCount: 109,
    commit: false,
    acceptConflicts: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--commit") {
      options.commit = true;
    } else if (argument === "--accept-conflicts") {
      options.acceptConflicts = true;
    } else if (argument === "--input") {
      options.input = requireNextValue(args, ++index, "--input");
    } else if (argument.startsWith("--input=")) {
      options.input = argument.slice("--input=".length);
    } else if (argument === "--expect-count") {
      options.expectedCount = parseExpectedCount(
        requireNextValue(args, ++index, "--expect-count"),
      );
    } else if (argument.startsWith("--expect-count=")) {
      options.expectedCount = parseExpectedCount(
        argument.slice("--expect-count=".length),
      );
    } else {
      throw new Error(`Unbekanntes Argument: ${argument}`);
    }
  }

  return options;
}

function requireNextValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} benötigt einen Wert.`);
  }
  return value;
}

function parseExpectedCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error("--expect-count muss eine ganze Zahl zwischen 1 und 500 sein.");
  }
  return count;
}

async function resolveInput(input) {
  const inputPath = path.resolve(input);
  let stat;

  try {
    stat = await Deno.stat(inputPath);
  } catch {
    throw new Error("Die angegebene Importquelle wurde nicht gefunden.");
  }

  if (stat.isDirectory) {
    return selectFromDirectory(inputPath);
  }

  if (!stat.isFile) {
    throw new Error("Die Importquelle muss eine CSV-/XLSX-Datei oder ein Verzeichnis sein.");
  }

  const extension = path.extname(inputPath).toLowerCase();
  if (extension === ".xlsx") {
    return { filePath: inputPath, extension, xlsxPriorityApplied: false };
  }

  if (extension !== ".csv") {
    throw new Error("Erlaubte Importformate sind ausschließlich XLSX und CSV.");
  }

  const xlsxCandidates = await findNamedCandidates(path.dirname(inputPath), ".xlsx");
  if (xlsxCandidates.length > 1) {
    throw new Error(
      "Mehrere passende XLSX-Dateien wurden gefunden. Bitte eine XLSX-Datei explizit mit --input angeben.",
    );
  }

  if (xlsxCandidates.length === 1) {
    return {
      filePath: xlsxCandidates[0],
      extension: ".xlsx",
      xlsxPriorityApplied: true,
    };
  }

  return { filePath: inputPath, extension: ".csv", xlsxPriorityApplied: false };
}

async function selectFromDirectory(directory) {
  const xlsxCandidates = await findNamedCandidates(directory, ".xlsx");
  if (xlsxCandidates.length > 1) {
    throw new Error(
      "Mehrere passende XLSX-Dateien wurden gefunden. Bitte eine Datei explizit mit --input angeben.",
    );
  }

  if (xlsxCandidates.length === 1) {
    return {
      filePath: xlsxCandidates[0],
      extension: ".xlsx",
      xlsxPriorityApplied: true,
    };
  }

  const csvCandidates = await findNamedCandidates(directory, ".csv");
  if (csvCandidates.length !== 1) {
    throw new Error(
      "Das Verzeichnis muss genau eine passende CSV-Datei enthalten, sofern keine XLSX-Datei vorliegt.",
    );
  }

  return {
    filePath: csvCandidates[0],
    extension: ".csv",
    xlsxPriorityApplied: false,
  };
}

async function findNamedCandidates(
  directory,
  extension,
) {
  const candidates = [];

  for await (const entry of Deno.readDir(directory)) {
    if (
      entry.isFile &&
      SOURCE_BASENAME_PATTERN.test(entry.name) &&
      path.extname(entry.name).toLowerCase() === extension
    ) {
      candidates.push(path.join(directory, entry.name));
    }
  }

  return candidates.sort((left, right) => left.localeCompare(right, "de"));
}

async function loadSourceTable(selectedInput) {
  if (selectedInput.extension === ".csv") {
    return parseCsv(await Deno.readTextFile(selectedInput.filePath));
  }

  const excelModule = await import(EXCELJS_URL);
  const ExcelJS = excelModule.default ?? excelModule;
  const workbook = new ExcelJS.Workbook();
  const bytes = await Deno.readFile(selectedInput.filePath);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );

  await workbook.xlsx.load(arrayBuffer);
  const worksheet = workbook.getWorksheet("Films");

  if (!worksheet) {
    throw new Error('Das XLSX-Tabellenblatt "Films" fehlt.');
  }

  const columnCount = worksheet.actualColumnCount || worksheet.columnCount;
  const headers = Array.from({ length: columnCount }, (_, index) =>
    readExcelCell(worksheet.getRow(1).getCell(index + 1).value, "Kopfzeile"),
  );
  const recognizedIndexes = new Set(
    headers
      .map((header, index) => ({ header: String(header ?? "").trim(), index }))
      .filter(({ header }) => SOURCE_COLUMNS.includes(header))
      .map(({ index }) => index),
  );
  const rows = [];

  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const sourceRow = new Array(columnCount).fill(null);
    for (const columnIndex of recognizedIndexes) {
      const columnLabel = String(headers[columnIndex]);
      sourceRow[columnIndex] = readExcelCell(
        worksheet.getRow(rowNumber).getCell(columnIndex + 1).value,
        `Zeile ${rowNumber}, ${columnLabel}`,
      );
    }
    rows.push(sourceRow);
  }

  return { headers, rows };
}

function readExcelCell(value, location) {
  if (value === null || value === undefined) {
    return null;
  }

  if (["string", "number", "boolean"].includes(typeof value)) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const cell = value;
    if ("result" in cell) {
      if (cell.result === undefined) {
        throw new Error(`${location}: Eine Formel besitzt kein gespeichertes Ergebnis.`);
      }
      return readExcelCell(cell.result, location);
    }
    if (Array.isArray(cell.richText)) {
      return cell.richText
        .map((part) =>
          typeof part === "object" && part !== null && "text" in part
            ? String(part.text ?? "")
            : ""
        )
        .join("");
    }
    if (typeof cell.text === "string") {
      return cell.text;
    }
  }

  throw new Error(`${location}: Nicht unterstützter XLSX-Zelltyp.`);
}

function printPreview(selectedInput, analysis) {
  const { stats } = analysis;

  console.log("CageDB Erstimport – Vorschau");
  console.log(`Quelle: ${path.basename(selectedInput.filePath)}`);
  console.log(`Format: ${selectedInput.extension.slice(1).toUpperCase()}`);
  if (selectedInput.xlsxPriorityApplied) {
    console.log("Priorität: XLSX wurde gemäß Importregel gegenüber CSV bevorzugt.");
  }
  console.log(`Datenzeilen: ${stats.total}`);
  console.log(`Erkannte Vertragsspalten: ${stats.recognizedColumnCount}`);
  console.log(
    `Verworfene Zusatzspalten: ${stats.discardedColumnCount} (Namen und Werte werden nicht ausgegeben)`,
  );
  console.log(`Gesehen gemäß Bewertung: ${stats.rated}`);
  console.log(`Watchlist gemäß fehlender Bewertung: ${stats.watchlist}`);

  console.log("\nKonfliktregeln");
  console.log(
    `1. Bewertung sticht watched/status: ${stats.conflictRatingOverrides} Fall/Fälle`,
  );
  console.log(
    `2. watched/status ohne Bewertung bleibt Watchlist: ${stats.conflictMissingRating} Fall/Fälle`,
  );

  for (const conflict of analysis.conflicts) {
    const sourceWatched = formatNullable(conflict.sourceWatched);
    const sourceStatus = formatNullable(conflict.sourceStatus);
    const resolution = conflict.resolvedWatched ? "gesehen" : "Watchlist";
    console.log(
      `- Zeile ${conflict.rowNumber}, ID ${conflict.legacyImportId}: watched=${sourceWatched}, status=${sourceStatus} → ${resolution}`,
    );
  }

  if (analysis.conflicts.length === 0) {
    console.log("- Keine Konfliktfälle erkannt.");
  }

  console.log("\nExplizite Datenlücken");
  console.log(`- Deutscher Titel fehlt: ${stats.germanTitleMissing}`);
  console.log(
    `- Deutscher Titel ist ein führendes Bindestrich-Fragment: ${stats.germanTitleFragmentCount}`,
  );
  console.log(`- RT Tomatometer fehlt: ${stats.rtTomatometerMissing}`);
  console.log(`- RT Audience fehlt: ${stats.rtAudienceMissing}`);
  console.log(`- IMDb fehlt: ${stats.imdbMissing}`);
  console.log(`- Genres fehlen in der Quelle: ${stats.total}`);
  console.log(`- Poster fehlen in der Quelle: ${stats.total}`);
  console.log("- Quellen-URL und Abrufdatum externer Scores fehlen in der Quelle.");
  console.log("  Diese Scores bleiben durch RLS öffentlich unsichtbar, bis die Provenienz ergänzt ist.");
  console.log("- Notizen, Tags und Cage-o-meter-Werte fehlen in der Quelle und werden nicht erfunden.");
  console.log("- Neue Filme werden unveröffentlicht angelegt; bestehende Veröffentlichungszustände bleiben unverändert.");
}

function formatNullable(value) {
  if (value === null || value === undefined || value === "") {
    return "leer";
  }
  return String(value);
}

async function commitImport(records) {
  const projectUrl = requireEnvironment("SUPABASE_URL");
  const secretKey = resolveImportSecretKey({
    secretKey: Deno.env.get("SUPABASE_SECRET_KEY"),
    legacyServiceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  });
  validateProjectUrl(projectUrl);

  const { createClient } = await import(SUPABASE_URL);
  const supabase = createClient(projectUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.rpc("import_initial_films", {
    p_films: records,
  });

  if (error) {
    const code = typeof error.code === "string" ? ` (${error.code})` : "";
    throw new Error(`Supabase-RPC fehlgeschlagen${code}: ${error.message}`);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Supabase-RPC lieferte kein gültiges Zählergebnis.");
  }

  return data;
}

function requireEnvironment(name) {
  const value = Deno.env.get(name)?.trim();
  if (!value || value.startsWith("YOUR_")) {
    throw new Error(`Die lokale Umgebungsvariable ${name} fehlt.`);
  }
  return value;
}

function validateProjectUrl(value) {
  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("SUPABASE_URL ist ungültig.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (parsedUrl.protocol !== "https:" && !localHosts.has(parsedUrl.hostname)) {
    throw new Error("SUPABASE_URL muss HTTPS verwenden; nur localhost darf HTTP nutzen.");
  }
}

function printCommitResult(result) {
  const counters = [
    ["Empfangen", "films_received"],
    ["Neu angelegt", "films_inserted"],
    ["Per legacy_import_id aktualisiert", "films_updated"],
    ["RT-Zeilen angewendet", "rt_score_rows_applied"],
    ["IMDb-Zeilen angewendet", "imdb_score_rows_applied"],
    ["Unverifizierte Score-Zeilen entfernt", "unverified_score_rows_removed"],
    ["Durch Import veröffentlicht", "published_by_import"],
  ];

  console.log("\nIMPORT ERFOLGREICH");
  for (const [label, key] of counters) {
    const value = result[key];
    console.log(`- ${label}: ${Number.isFinite(Number(value)) ? Number(value) : "unbekannt"}`);
  }
}

function printHelp() {
  console.log(`CageDB Erstimport

Aufruf:
  deno run --no-prompt --allow-read=/ABSOLUTER/DATENPFAD \\
    tools/initial-import/import-films.mjs --input /ABSOLUTER/DATENPFAD

Optionen:
  --input <Datei|Verzeichnis>  XLSX-/CSV-Quelle; XLSX hat Vorrang
  --expect-count <1..500>      Erwartete Zeilen, Standard: 109
  --commit                     Atomaren Supabase-Upsert ausführen
  --accept-conflicts           Erkannte watched/status-Konflikte explizit akzeptieren
  --help                       Diese Hilfe anzeigen

Für XLSX zusätzlich:
  --allow-import=esm.sh

Für --commit zusätzlich:
  --allow-env=SUPABASE_URL,SUPABASE_SECRET_KEY,SUPABASE_SERVICE_ROLE_KEY
  --allow-import=esm.sh
  --allow-net=DEIN_PROJECT_REF.supabase.co
`);
}
