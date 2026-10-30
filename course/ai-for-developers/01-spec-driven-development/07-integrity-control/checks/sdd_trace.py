"""Stage-0 traceability rules shared by L5 and L7 (design #41, 2.7, L5 item 3, L5 item 5 / L7 (C)).

Every rule goes through sdd_grammar, the one resolver of the module.
"""

import re
from pathlib import Path

import sdd_grammar

TEST_NAME = re.compile(r"^test_req_\d{2}_\w*[A-Za-z0-9]$")


def test_name_problems(test_file: Path) -> list[str]:
    """Item 3: names `test_req_NN_<words>`, at most two `req_NN` labels each."""
    problems: list[str] = []
    for line, name in sdd_grammar.test_method_names(test_file):
        labels = sdd_grammar.labels_of(name)
        if len(labels) > sdd_grammar.MAX_LABELS_PER_NAME:
            problems.append(f"{test_file}, строка {line}: слишком много требований в одном имени теста ({name})")
        elif not TEST_NAME.match(name):
            problems.append(f"{test_file}, строка {line}: имя теста {name} не вида test_req_NN_<слова>")
    return problems


def pristine_avoid_words(glossary_root: Path) -> frozenset[str]:
    return sdd_grammar.load_glossary(glossary_root).avoid_words


RULE_TEXT = {
    "C1": "требование спецификации не перечислено ни в одной задаче",
    "C2": "ссылка на требование, которого нет в спецификации",
    "C3": "у требования выполненной задачи нет теста с его меткой",
    "C4": "нумерация или статус ADR",
    "C5": "ссылка на заменённый или устаревший ADR",
    "C6": "слово, которого глоссарий велит избегать",
}


def finding_problem(finding: sdd_grammar.Finding) -> str:
    return f"{finding.rule} {finding.file}: {finding.token} ({RULE_TEXT[finding.rule]})"
