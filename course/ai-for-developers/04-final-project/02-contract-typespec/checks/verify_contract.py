"""contract-matches (design #44, 4.L2 check 1): the grader compiles contract/ and compares the result.

The learner's OpenAPI file, tspconfig and any JS are never read: the grader copies the regular `*.tsp`
files of contract/ (final_runtime.copy_contract), compiles them with the pinned TypeSpec 1.17.0 under
the exact JS allowlist of 7.2 with its own options (openapi3, JSON, OpenAPI 3.1.0, sealed objects,
warnings as errors), and compares the emitted document with checks/data/openapi.expected.json.

Both documents are normalised the same way before the comparison: `$ref` resolved and inlined,
descriptions, titles, examples, operationIds, readOnly/writeOnly, `x-` extensions, response
descriptions and response headers dropped, integer `format` dropped, `enum` and `required` compared as
sets, `allOf` of objects flattened, unions of string enums merged. Then per operation (method + path):
parameters (name, in, required, schema; `pattern` as an exact string), the request body (required,
content type, schema) and each response (status, content type, schema).
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared runtime lives next to this script.
sys.path.insert(0, str(CHECKS_DIR))

import final_runtime as runtime  # noqa: E402

DATA = CHECKS_DIR / "data"
EXPECTED = DATA / "openapi.expected.json"
ALLOWLIST = DATA / "tsp-js-allowlist.json"
PINNED_LIBRARIES = {"@typespec/compiler": "1.17.0", "@typespec/http": "1.17.0", "@typespec/openapi": "1.17.0",
                    "@typespec/openapi3": "1.17.0"}
COMPILE_TIMEOUT_SEC = 90
METHODS = ("get", "put", "post", "delete", "options", "head", "patch", "trace")
DROPPED_KEYS = frozenset({"description", "title", "summary", "example", "examples", "readOnly", "writeOnly",
                          "deprecated", "externalDocs", "$comment"})
UPPER_BOUNDS = frozenset({"maximum", "exclusiveMaximum", "maxLength", "maxItems", "maxProperties"})
LOWER_BOUNDS = frozenset({"minimum", "exclusiveMinimum", "minLength", "minItems", "minProperties"})
PROBLEM_MEDIA_TYPE = "application/problem+json"
MAX_PROBLEMS = 15
ALLOWED_IMPORTS_TEXT = ("проверка компилирует только ваши .tsp из contract/ и библиотеки @typespec/http, "
                        "@typespec/openapi, @typespec/openapi3; JS-файлы, абсолютные пути, другие пакеты и URL "
                        "не принимаются")


class NormaliseError(Exception):
    """The emitted document has a shape the normaliser does not read (Russian message)."""


# ---------------------------------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------------------------------


def _resolve_pointer(document: dict[str, object], reference: str) -> object:
    if not reference.startswith("#/"):
        raise NormaliseError(f"ссылка {reference} ведёт за пределы документа")
    node: object = document
    for part in reference[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if not isinstance(node, dict) or part not in node:
            raise NormaliseError(f"ссылка {reference} никуда не ведёт")
        node = node[part]
    return node


def _merge(base: dict[str, object], extra: dict[str, object]) -> dict[str, object] | None:
    """Merge two normalised object-or-scalar schemas; None when they cannot be read as one."""
    merged = dict(base)
    for key, value in extra.items():
        if key not in merged or merged[key] == value:
            merged[key] = value
        elif key == "properties" and isinstance(value, dict) and isinstance(merged[key], dict):
            properties = dict(merged[key])  # type: ignore[arg-type]
            for name, schema in value.items():
                if name in properties and properties[name] != schema:
                    return None
                properties[name] = schema
            merged[key] = properties
        elif key == "required" and isinstance(value, list) and isinstance(merged[key], list):
            merged[key] = sorted(set(merged[key]) | set(value))  # type: ignore[arg-type]
        elif key in UPPER_BOUNDS and isinstance(value, (int, float)):
            merged[key] = min(merged[key], value)  # type: ignore[type-var]
        elif key in LOWER_BOUNDS and isinstance(value, (int, float)):
            merged[key] = max(merged[key], value)  # type: ignore[type-var]
        else:
            return None
    return merged


def normalise_schema(document: dict[str, object], schema: object, trail: tuple[str, ...] = ()) -> object:
    if not isinstance(schema, dict):
        return schema
    if len(trail) > 64:
        raise NormaliseError("схема вложена слишком глубоко или ссылается сама на себя")
    result: dict[str, object] = {}
    reference = schema.get("$ref")
    if isinstance(reference, str):
        if reference in trail:
            raise NormaliseError(f"схема {reference} ссылается сама на себя; контракт урока без рекурсии")
        target = normalise_schema(document, _resolve_pointer(document, reference), (*trail, reference))
        result = dict(target) if isinstance(target, dict) else {}
    for key, value in schema.items():
        if key == "$ref" or key in DROPPED_KEYS or key.startswith("x-"):
            continue
        if key in ("properties", "patternProperties", "$defs"):
            value = {name: normalise_schema(document, item, trail) for name, item in sorted(value.items())}
        elif key in ("items", "additionalProperties", "unevaluatedProperties", "not", "contains",
                     "propertyNames", "if", "then", "else"):
            value = normalise_schema(document, value, trail)
        elif key in ("allOf", "anyOf", "oneOf", "prefixItems"):
            value = [normalise_schema(document, item, trail) for item in value]
        elif key in ("enum", "required"):
            value = sorted(value, key=json.dumps)
        if key in result and result[key] != value:
            merged = _merge(result, {key: value})
            if merged is None:
                result = {"allOf": [result, {key: value}]}
                continue
            result = merged
        else:
            result[key] = value
    if result.get("type") == "integer":
        result.pop("format", None)
    return _simplify(result)


def _simplify(schema: dict[str, object]) -> dict[str, object]:
    parts = schema.get("allOf")
    if isinstance(parts, list) and all(isinstance(part, dict) for part in parts):
        rest = {key: value for key, value in schema.items() if key != "allOf"}
        merged: dict[str, object] | None = rest
        for part in parts:
            merged = _merge(merged, part) if merged is not None else None
        if merged is not None:
            return _simplify(merged)
    for combinator in ("anyOf", "oneOf"):
        options = schema.get(combinator)
        if isinstance(options, list) and options and all(
                isinstance(option, dict) and set(option) <= {"type", "enum", "const"} and option.get("type") == "string"
                for option in options):
            values: set[str] = set()
            for option in options:
                values.update(option.get("enum", []))  # type: ignore[arg-type]
                if "const" in option:
                    values.add(option["const"])  # type: ignore[arg-type]
            rest = {key: value for key, value in schema.items() if key != combinator}
            return {**rest, "type": "string", "enum": sorted(values)}
    if "const" in schema and set(schema) <= {"const", "type"}:
        return {"type": schema.get("type", "string"), "enum": [schema["const"]]}
    return schema


def _resolved(document: dict[str, object], node: object) -> dict[str, object]:
    seen = 0
    while isinstance(node, dict) and isinstance(node.get("$ref"), str):
        node = _resolve_pointer(document, node["$ref"])  # type: ignore[arg-type]
        seen += 1
        if seen > 16:
            raise NormaliseError("цепочка ссылок слишком длинная")
    if not isinstance(node, dict):
        raise NormaliseError("ожидался объект")
    return node


def _content(document: dict[str, object], content: object) -> dict[str, object]:
    if not isinstance(content, dict):
        return {}
    return {media.lower(): normalise_schema(document, _resolved(document, entry).get("schema"))
            for media, entry in sorted(content.items())}


def normalise_document(document: object) -> dict[str, dict[str, object]]:
    """{"POST /bookings": {"parameters": {...}, "requestBody": {...} | None, "responses": {...}}}."""
    if not isinstance(document, dict) or not isinstance(document.get("paths"), dict):
        raise NormaliseError("в документе нет раздела paths")
    operations: dict[str, dict[str, object]] = {}
    for path, item in document["paths"].items():  # type: ignore[union-attr]
        item = _resolved(document, item)
        shared = item.get("parameters", [])
        for method in METHODS:
            if method not in item:
                continue
            operation = _resolved(document, item[method])
            parameters: dict[str, object] = {}
            for raw in [*shared, *operation.get("parameters", [])]:  # type: ignore[misc]
                parameter = _resolved(document, raw)
                where = str(parameter.get("in"))
                name = str(parameter.get("name"))
                key = f"{where} {name.lower() if where == 'header' else name}"
                parameters[key] = {"name": name, "required": bool(parameter.get("required", where == "path")),
                                   "schema": normalise_schema(document, parameter.get("schema"))}
            body = operation.get("requestBody")
            request_body = None
            if body is not None:
                body = _resolved(document, body)
                request_body = {"required": bool(body.get("required", False)),
                                "content": _content(document, body.get("content"))}
            responses = {str(status): _content(document, _resolved(document, response).get("content"))
                         for status, response in operation.get("responses", {}).items()}  # type: ignore[union-attr]
            operations[f"{method.upper()} {path}"] = {"parameters": parameters, "requestBody": request_body,
                                                       "responses": responses}
    return operations


# ---------------------------------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------------------------------


def _show(value: object) -> str:
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    return text if len(text) <= 160 else text[:157] + "..."


def schema_differences(expected: object, actual: object, where: str) -> list[str]:
    if isinstance(expected, dict) and isinstance(actual, dict):
        found: list[str] = []
        for key in sorted(set(expected) | set(actual)):
            if key not in actual:
                found.append(f"{where}: нет `{key}` (ожидалось {_show(expected[key])})")
            elif key not in expected:
                found.append(f"{where}: лишнее `{key}`: {_show(actual[key])}")
            elif key == "properties" and isinstance(expected[key], dict) and isinstance(actual[key], dict):
                for name in sorted(set(expected[key]) | set(actual[key])):
                    if name not in actual[key]:
                        found.append(f"{where}: нет поля `{name}`")
                    elif name not in expected[key]:
                        found.append(f"{where}: лишнее поле `{name}`")
                    else:
                        found.extend(schema_differences(expected[key][name], actual[key][name], f"{where}.{name}"))
            elif key == "required" and isinstance(expected[key], list) and isinstance(actual[key], list):
                # A field missing on one side is already reported by `properties`; only shared fields here.
                shared = set(expected.get("properties", {})) & set(actual.get("properties", {}))  # type: ignore[arg-type]
                for name in sorted((set(expected[key]) - set(actual[key])) & shared):
                    found.append(f"{where}: поле `{name}` должно быть обязательным")
                for name in sorted((set(actual[key]) - set(expected[key])) & shared):
                    found.append(f"{where}: поле `{name}` должно быть необязательным")
            elif key == "pattern" and expected[key] != actual[key]:
                found.append(f"{where}: pattern отличается: скопируйте строку из task.md (сейчас {_show(actual[key])})")
            elif key == "items":
                found.extend(schema_differences(expected[key], actual[key], f"{where}[]"))
            elif expected[key] != actual[key]:
                if isinstance(expected[key], dict) and isinstance(actual[key], dict):
                    found.extend(schema_differences(expected[key], actual[key], f"{where}.{key}"))
                else:
                    found.append(f"{where}: `{key}` равно {_show(actual[key])}, ожидалось {_show(expected[key])}")
        return found
    if expected != actual:
        return [f"{where}: {_show(actual)}, ожидалось {_show(expected)}"]
    return []


def _response_kind(status: str) -> str:
    return "ошибки" if status[:1] in ("4", "5") else "успеха"


def compare(expected: dict[str, dict[str, object]], actual: dict[str, dict[str, object]]) -> list[str]:
    problems: list[str] = []
    for key in sorted(set(expected) - set(actual)):
        problems.append(f"нет операции {key}")
    for key in sorted(set(actual) - set(expected)):
        problems.append(f"лишняя операция {key}: в контракте урока ровно {len(expected)} операций")
    for key in sorted(set(expected) & set(actual)):
        want, got = expected[key], actual[key]
        want_parameters: dict[str, dict[str, object]] = want["parameters"]  # type: ignore[assignment]
        got_parameters: dict[str, dict[str, object]] = got["parameters"]  # type: ignore[assignment]
        for name in sorted(set(want_parameters) - set(got_parameters)):
            problems.append(f"{key}: нет параметра {name}")
        for name in sorted(set(got_parameters) - set(want_parameters)):
            problems.append(f"{key}: лишний параметр {name}")
        for name in sorted(set(want_parameters) & set(got_parameters)):
            wanted, gotten = want_parameters[name], got_parameters[name]
            name = f"{name.split(' ', 1)[0]} {wanted['name']}"
            if wanted["required"] != gotten["required"]:
                state = "обязательным" if wanted["required"] else "необязательным"
                problems.append(f"{key}: параметр {name} должен быть {state}")
            problems.extend(schema_differences(wanted["schema"], gotten["schema"], f"{key}: параметр {name}"))
        want_body, got_body = want["requestBody"], got["requestBody"]
        if want_body is None and got_body is not None:
            problems.append(f"{key}: у операции не должно быть тела запроса")
        elif want_body is not None and got_body is None:
            problems.append(f"{key}: нет тела запроса")
        elif isinstance(want_body, dict) and isinstance(got_body, dict):
            if want_body["required"] != got_body["required"]:
                problems.append(f"{key}: тело запроса должно быть обязательным")
            problems.extend(_content_problems(want_body["content"], got_body["content"], f"{key}: тело запроса"))
        want_responses: dict[str, dict[str, object]] = want["responses"]  # type: ignore[assignment]
        got_responses: dict[str, dict[str, object]] = got["responses"]  # type: ignore[assignment]
        for status in sorted(set(want_responses) - set(got_responses)):
            problems.append(f"{key}: нет ответа {status}")
        for status in sorted(set(got_responses) - set(want_responses)):
            problems.append(f"{key}: лишний ответ {status}")
        for status in sorted(set(want_responses) & set(got_responses)):
            problems.extend(_content_problems(want_responses[status], got_responses[status],
                                              f"{key}: ответ {status}", status))
    return problems


def _content_problems(want: object, got: object, where: str, status: str | None = None) -> list[str]:
    assert isinstance(want, dict) and isinstance(got, dict)
    if set(want) != set(got):
        expected_types = ", ".join(sorted(want)) or "без тела"
        actual_types = ", ".join(sorted(got)) or "без тела"
        if status is not None and status[:1] == "4" and PROBLEM_MEDIA_TYPE in want:
            return [f"{where}: тип содержимого {actual_types}, а ответ об ошибке должен быть {PROBLEM_MEDIA_TYPE} "
                    "(решение 1 контракта)"]
        kind = f" {_response_kind(status)}" if status is not None else ""
        return [f"{where}{kind}: тип содержимого {actual_types}, ожидался {expected_types}"]
    found: list[str] = []
    for media in sorted(want):
        found.extend(schema_differences(want[media], got[media], f"{where} ({media})"))
    return found


# ---------------------------------------------------------------------------------------------------
# Check
# ---------------------------------------------------------------------------------------------------


def _check_pinned(layout: runtime.Layout) -> None:
    for name, version in PINNED_LIBRARIES.items():
        manifest = Path(layout.pinned_node_modules) / name / "package.json"
        try:
            found = json.loads(manifest.read_text(encoding="utf-8")).get("version")
        except (OSError, ValueError):
            found = None
        if found != version:
            raise runtime.GraderError(f"в образе нет {name} {version} (найдено: {found})")


def diagnostics_problems(record: dict[str, object]) -> list[str]:
    lines: list[str] = []
    for diagnostic in record.get("diagnostics", []):  # type: ignore[union-attr]
        assert isinstance(diagnostic, dict)
        where = f"contract/{diagnostic['file']}" if diagnostic.get("file") else "contract"
        if diagnostic.get("line"):
            where += f":{diagnostic['line']}"
        lines.append(f"{where}: {diagnostic.get('code')}: {diagnostic.get('message')}")
    return lines


def evaluate(workspace: Path) -> tuple[list[str], str]:
    """(problems, pass line). Raises GraderError when the grader itself cannot run."""
    layout = runtime.load_layout()
    runtime.self_check_tools(layout, ("node",))
    _check_pinned(layout)
    root = runtime.grader_root(workspace)
    try:
        try:
            outcome = runtime.compile_contract(workspace / "contract", root, layout, ALLOWLIST, COMPILE_TIMEOUT_SEC)
        except runtime.ContractCopyError as error:
            return [str(error)], ""
        record = outcome.record
        if record.get("timedOut"):
            return [f"компиляция contract/main.tsp не уложилась в {COMPILE_TIMEOUT_SEC} с"], ""
        if record.get("crashed"):
            return [f"компилятор TypeSpec упал на вашем контракте: {record.get('error')}"], ""
        refused = [str(item) for item in record.get("refusedImports", [])]  # type: ignore[union-attr]
        if refused:
            return [f"импорт JS-модуля отклонён: {item}; {ALLOWED_IMPORTS_TEXT}" for item in refused], ""
        outside = record.get("badContexts", [])
        if outside:
            return [f"в компиляцию попал файл вне разрешённых ({item['context']}: {item['file']}); "  # type: ignore[index]
                    f"{ALLOWED_IMPORTS_TEXT}" for item in outside], ""  # type: ignore[union-attr]
        if record.get("hasError"):
            return ["компиляция contract/main.tsp с ошибками (предупреждения тоже считаются ошибками):",
                    *diagnostics_problems(record)], ""
        if record.get("deterministic") is False:
            raise runtime.GraderError("две компиляции одного контракта дали разный результат")
        document_text = record.get("document")
        if not isinstance(document_text, str):
            count = len(record.get("emitted", []))  # type: ignore[arg-type]
            return [f"компиляция дала {count} файлов OpenAPI, нужен ровно один: в контракте один `@service`"], ""
        try:
            actual = normalise_document(runtime.strict_json(document_text))
            expected = normalise_document(runtime.strict_json(EXPECTED.read_text(encoding="utf-8")))
        except NormaliseError as error:
            return [f"OpenAPI из вашего контракта не читается проверкой: {error}"], ""
        problems = compare(expected, actual)
        return problems, (f"Пройдено: контракт компилируется (файлов .tsp: {len(outcome.copied)}) и совпадает с "
                          f"обязательным по всем {len(expected)} операциям.")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def main() -> int:
    runtime.make_grader_non_dumpable()
    try:
        problems, passed = evaluate(Path.cwd().resolve())
    except runtime.GraderError as error:
        print(error)
        return 1
    if problems:
        shown = problems[:MAX_PROBLEMS]
        more = len(problems) - len(shown)
        print("\n".join(shown + ([f"и ещё {more} расхождений"] if more > 0 else [])))
        return 1
    print(passed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
