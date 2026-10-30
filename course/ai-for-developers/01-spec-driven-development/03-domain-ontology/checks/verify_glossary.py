"""Structure filter for the glossary (glossary-structure, design #41 L3).

A form filter only: definition quality, the polyseme reasoning and whether the relationships match the
interview are graded by the rubric (rubric-glossary.md). Expected terms and avoided words come from
data/glossary_key.json, never from the workspace; every glossary file is read with the 2.7 grammar in
sdd_grammar.py.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared grammar lives next to this script.
sys.path.insert(0, str(CHECKS_DIR))

import sdd_grammar as grammar  # noqa: E402

KEY_PATH = CHECKS_DIR / "data" / "glossary_key.json"
MARKERS_PATH = CHECKS_DIR / "data" / "impl_markers.json"
WORKSPACE = Path.cwd().resolve()
SENTENCE_END = (".", "!", "?", "…")
MIN_DEFINITION_WORDS = 3
WORD = re.compile(r"\w+")


def reject_constant(value: str) -> None:
    raise ValueError(f"non-standard JSON constant {value}")


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)


def normalized_link(target: str) -> str:
    path = target.split("#", 1)[0]
    while path.startswith("./"):
        path = path[2:]
    return path


def check_map(glossary_map: grammar.GlossaryMap, key: dict, context_names: dict[str, str], errors: list[str]) -> None:
    linked = {normalized_link(target) for target in glossary_map.context_links}
    expected = set(key["contextFiles"])
    if "Contexts" not in glossary_map.sections:
        errors.append(f"{grammar.GLOSSARY_MAP}: нет раздела `## Contexts`")
    elif linked != expected:
        errors.append(
            f"{grammar.GLOSSARY_MAP}: в `## Contexts` должны быть ссылки ровно на два файла контекстов "
            f"(списком Markdown-ссылок), сейчас ссылок на них: {len(linked & expected)}, лишних: {len(linked - expected)}"
        )
    if "Relationships" not in glossary_map.sections:
        errors.append(f"{grammar.GLOSSARY_MAP}: нет раздела `## Relationships`")
        return
    minimum = key["minRelationships"]
    if len(glossary_map.relationships) < minimum:
        errors.append(
            f"{grammar.GLOSSARY_MAP}: в `## Relationships` нужно не меньше {minimum} строк списка, "
            f"сейчас {len(glossary_map.relationships)}"
        )
    names = list(context_names.values())
    for line, text in glossary_map.relationships:
        missing = [name for name in names if not re.search(rf"(?<![A-Za-z]){re.escape(name)}(?![A-Za-z])", text, re.I)]
        if missing:
            errors.append(
                f"{grammar.GLOSSARY_MAP}:{line}: строка связи должна называть оба контекста их именами из заголовков "
                f"`# <Контекст>` файлов контекстов (не найдено: {', '.join(missing)})"
            )
        if not grammar.EVENT.search(text):
            errors.append(
                f"{grammar.GLOSSARY_MAP}:{line}: в строке связи нет доменного события в обратных кавычках "
                "в PascalCase, например `SomethingHappened`"
            )


def check_definition(path: str, entry: grammar.GlossaryEntry, markers: list[dict], errors: list[str]) -> None:
    definition = entry.definition.strip()
    if len(WORD.findall(definition)) < MIN_DEFINITION_WORDS or not definition.endswith(SENTENCE_END):
        errors.append(
            f"{path}:{entry.line}: определение `{entry.term}` должно быть хотя бы одним предложением "
            f"(не меньше {MIN_DEFINITION_WORDS} слов, в конце . ! ? или …)"
        )
    for marker in markers:
        if re.search(marker["pattern"], definition):
            errors.append(
                f"{path}:{entry.line}: в определении `{entry.term}` деталь реализации ({marker['label']}); "
                "глоссарий описывает предметную область, не код"
            )


def check_context(context: grammar.ContextGlossary, key: dict, markers: list[dict], errors: list[str]) -> None:
    path = context.path
    required: dict[str, list[str]] = key["requiredTerms"][path]
    entries = {grammar.normalize_term(entry.term): entry for entry in context.entries}
    max_terms = key["maxTermsPerContext"]
    if len(context.entries) > max_terms:
        errors.append(f"{path}: терминов {len(context.entries)}, допускается не больше {max_terms}")
    if len(entries) != len(context.entries):
        errors.append(f"{path}: термин определён дважды (имена сравниваются без пробелов и без учёта регистра)")
    for term, avoid_words in required.items():
        entry = entries.get(grammar.normalize_term(term))
        if entry is None:
            errors.append(f"{path}: нет термина `{term}`")
            continue
        listed = {word.lower() for word in entry.avoid}
        if any(word not in listed for word in avoid_words):
            errors.append(
                f"{path}:{entry.line}: у `{entry.term}` в `_Avoid_` перечислены не все слова, которых по интервью "
                "команда избегает для этого термина"
            )
    terms = set(entries)
    for entry in context.entries:
        check_definition(path, entry, markers, errors)
        if len(entry.avoid) > key["maxAvoidWords"]:
            errors.append(
                f"{path}:{entry.avoid_line}: в `_Avoid_` у `{entry.term}` {len(entry.avoid)} слов, "
                f"допускается не больше {key['maxAvoidWords']}"
            )
        for word in entry.avoid:
            if word.lower() in terms:
                errors.append(
                    f"{path}:{entry.avoid_line}: `{word}` в `_Avoid_` - это термин этого же контекста; "
                    "термин нельзя одновременно запрещать"
                )


def check_polyseme(contexts: dict[str, grammar.ContextGlossary], key: dict, errors: list[str]) -> None:
    rule = key["polyseme"]
    word = rule["word"]
    home = contexts.get(rule["avoidedUnder"]["file"])
    if home is not None:
        term = grammar.normalize_term(rule["avoidedUnder"]["term"])
        owner = next((entry for entry in home.entries if grammar.normalize_term(entry.term) == term), None)
        if owner is not None and word not in {avoid.lower() for avoid in owner.avoid}:
            errors.append(
                f"{home.path}:{owner.line}: слово `{word}` должно быть в `_Avoid_` у `{owner.term}`: "
                "в этом контексте оно означает не то, что в другом"
            )
    other = contexts.get(rule["neverAvoidedIn"])
    if other is not None:
        for entry in other.entries:
            if word in {avoid.lower() for avoid in entry.avoid}:
                errors.append(
                    f"{other.path}:{entry.avoid_line}: `{word}` нельзя запрещать в этом контексте: "
                    "здесь это слово - термин"
                )


def main() -> int:
    key = load_json(KEY_PATH)
    markers = load_json(MARKERS_PATH)
    if not isinstance(key, dict) or not isinstance(markers, list):
        print("ошибка данных проверки: ключ повреждён", file=sys.stderr)
        return 2
    errors: list[str] = []
    map_path = WORKSPACE / grammar.GLOSSARY_MAP
    if not map_path.is_file():
        print(f"{grammar.GLOSSARY_MAP} не найден в корне рабочей папки")
        return 1
    glossary_map = grammar.parse_glossary_map(map_path.read_text(encoding="utf-8"))
    contexts: dict[str, grammar.ContextGlossary] = {}
    for path in key["contextFiles"]:
        file = WORKSPACE / path
        if not file.is_file():
            errors.append(f"{path}: файл контекста не найден")
            continue
        try:
            contexts[path] = grammar.parse_context_glossary(path, file.read_text(encoding="utf-8"))
        except grammar.GlossaryFormatError as error:
            errors.append(f"{error} (формат: `# <Контекст>`, `## Language`, `**Термин**: определение`, `_Avoid_: слово, слово`)")
    check_map(glossary_map, key, {path: context.name for path, context in contexts.items()}, errors)
    for context in contexts.values():
        check_context(context, key, markers, errors)
    check_polyseme(contexts, key, errors)
    if errors:
        print("\n".join(errors))
        return 1
    print("Пройдено: структура глоссария верна. Качество определений и связей оценивает ментор по рубрике.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
