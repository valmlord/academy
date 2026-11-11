"""docker-static (design #44, 4.L8 check 1): compose.yaml and the Dockerfiles it builds, read statically.

No learner process runs and nothing is built: the platform does not build or run images (residual R5). The check
judges what `docker compose up` in the workspace root would run, so it closes both the set of files compose reads
and the set of keys inside compose.yaml. Rules:
- compose.yaml at the workspace root, in the compose subset of docker_static.py, and no other input compose reads
  by default: none of the override files (compose.override.yaml/.yml, docker-compose.override.yaml/.yml, merged
  into compose.yaml by `docker compose up`), no other default file name, no `.env` (it can set COMPOSE_FILE);
- top level: only `services` and `volumes` (no `include`, no extension fields); a named volume has no settings;
- services: exactly `api` and `web`, each a mapping with only the keys of SERVICE_KEYS (no `user`, `image`,
  `extends`, `network_mode`, `pid`, `privileged`, `volumes` on web, ...);
- `build`: a context path, or a mapping with `context` and only `dockerfile`, `args` and `target` beside it. The
  context and the dockerfile are relative paths of BUILD_PATH characters that stay inside the workspace, also after
  symlinks are resolved. compose-go (paths/context.go) passes `github.com/...`, `git@...`, any `://` and
  `service:...` on as remote or service contexts and expands a leading `~`; BUILD_PATH has no `:`, `@` or `~`, and
  the `github.com/` prefix is refused by name;
- `args` does not set an ARG declared before the first FROM (that ARG picks the base image) and no BUILDKIT_ name
  (BUILDKIT_SYNTAX replaces the frontend, frontend/dockerfile/builder/build.go); `target` names the final stage,
  the one this check reads, compared lower-cased like BuildKit's findStateByName;
- api `volumes`: named volumes from the top-level `volumes`, `NAME:/path[:ro|rw]`, never a host path;
- web: `depends_on` names api; `environment` sets CALENDAR_API_URL=http://api:8080; `ports` publishes it;
- only web publishes ports; `env_file` is not accepted;
- no service sets the test variables CALENDAR_NOW or CALENDAR_BOOKING_DELAY_MS, and no ENV or ARG of the final
  stage chain declares them;
- api: `healthcheck.test` is a block sequence CMD, the executable of the api image, then its own subcommand
  (a distroless final stage has no curl or wget); healthcheck keys are the timing ones only (no `disable`);
- each Dockerfile passes the FROM set F1-F8 (R1-R6 refused) and its final stage runs as a non-root user set by
  an explicit USER in its stage chain (a numeric user is compared as a number: runc parses it with Atoi, so
  `USER 00` is uid 0); no ONBUILD in a stage the final stage is built FROM (BuildKit runs those triggers in the
  child stage, dockerfile2llb resolveStages); the api final stage has an exec-form ENTRYPOINT or CMD.
"""

from __future__ import annotations

import posixpath
import re
import stat
import sys
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

import docker_static as ds  # noqa: E402

COMPOSE = "compose.yaml"
# compose-go's default lookup: the first existing of DEFAULT_FILES is the project file, and the first existing
# override name is merged into it whatever the project file is called.
OTHER_DEFAULT_FILES = ("compose.yml", "docker-compose.yml", "docker-compose.yaml")
OVERRIDE_FILES = ("compose.override.yml", "compose.override.yaml", "docker-compose.override.yml",
                  "docker-compose.override.yaml")
DOTENV = ".env"
API_URL = "http://api:8080"
TEST_VARIABLES = ("CALENDAR_NOW", "CALENDAR_BOOKING_DELAY_MS")
MAX_FILE_BYTES = 256 * 1024
SERVICES = ("api", "web")
TOP_LEVEL_KEYS = ("services", "volumes")
# What R8 and the honest corpus use, plus `restart`. Every other key can change who runs the process, what it sees
# of the host or which image runs, and this check reads none of them.
SERVICE_KEYS = {
    "api": ("build", "environment", "healthcheck", "volumes", "restart"),
    "web": ("build", "environment", "depends_on", "ports", "healthcheck", "restart"),
}
BUILD_KEYS = ("context", "dockerfile", "args", "target")
HEALTHCHECK_KEYS = ("test", "interval", "timeout", "retries", "start_period", "start_interval")
KEY_REASONS = {
    "user": "пользователя задаёт USER в Dockerfile, и его читает проверка",
    "image": "образ собирается из build, а image может подменить его готовым образом",
    "extends": "extends берёт настройки из другого сервиса или файла, которые проверка не читает",
    "include": "include подключает другие файлы compose, которые проверка не читает",
}
BUILD_PATH = re.compile(r"^[A-Za-z0-9._/-]+$")
NAMED_VOLUME = re.compile(r"^([A-Za-z0-9][A-Za-z0-9_.-]*):(/[^:]*)(?::(?:ro|rw))?$")


def read_regular(workspace: Path, relative: str) -> tuple[str | None, str | None]:
    path = workspace / relative
    if path.is_symlink():
        return None, f"{relative}: символическая ссылка не допускается, нужен обычный файл"
    if not path.exists():
        return None, None
    if not stat.S_ISREG(path.lstat().st_mode) or path.stat().st_size > MAX_FILE_BYTES:
        return None, f"{relative}: нужен обычный текстовый файл до 256 КБ"
    # Bytes, not read_text: universal newlines would turn a lone \r into a line break, which BuildKit's scanner
    # does not do, so the readers must see the file as it is.
    return path.read_bytes().decode("utf-8", errors="replace"), None


def other_compose_inputs(workspace: Path) -> list[str]:
    """Files beside compose.yaml that `docker compose up` would read, or that make it unclear which file runs."""
    problems = []
    for name in OVERRIDE_FILES:
        if (workspace / name).is_symlink() or (workspace / name).exists():
            problems.append(f"{name}: docker compose up сам добавляет этот файл к {COMPOSE}, а проверка читает только "
                            f"{COMPOSE}; удалите его или перенесите настройки в {COMPOSE}")
    for name in OTHER_DEFAULT_FILES:
        if (workspace / name).is_symlink() or (workspace / name).exists():
            problems.append(f"{name}: второй файл compose рядом с {COMPOSE}; оставьте один {COMPOSE}, его и читает "
                            "проверка")
    if (workspace / DOTENV).is_symlink() or (workspace / DOTENV).exists():
        problems.append(f"{DOTENV}: docker compose читает его сам, и COMPOSE_FILE в нём меняет набор файлов compose; "
                        "проверка его не принимает, переменные сервисов пишите в environment")
    return problems


def key_line(key: object, fallback: int) -> int:
    return key.line if isinstance(key, ds.Scalar) else fallback


def refused_key(key: object, where: str, allowed: tuple[str, ...], line: int) -> str:
    reason = KEY_REASONS.get(str(key), "")
    return (f"{COMPOSE}: строка {key_line(key, line)}: ключ {key} {where} курс не принимает"
            + (f" ({reason})" if reason else "") + f"; допустимы: {', '.join(allowed)}")


def top_level_problems(root: ds.Mapping) -> list[str]:
    problems = [refused_key(key, "в корне файла", TOP_LEVEL_KEYS, root.line) for key in root if key not in TOP_LEVEL_KEYS]
    volumes = root.get("volumes")
    if volumes is None:
        return problems
    if not isinstance(volumes, ds.Mapping):
        return problems + [f"{COMPOSE}: раздел volumes должен быть словарём именованных томов"]
    for name, settings in volumes.items():
        if settings is not None:
            problems.append(f"{COMPOSE}: строка {key_line(name, volumes.line)}: том {name}: курс принимает только "
                            f"именованный том без настроек ({name}: без значения); driver и driver_opts могут подключить "
                            "каталог хоста")
    return problems


def path_problem(workspace: Path, value: str, joined: str) -> str | None:
    """Why a build path does not name a place inside the workspace, or None. `value` is the path as written in
    compose.yaml, `joined` the workspace-relative path it names (a dockerfile is relative to the context)."""
    if not BUILD_PATH.match(value) or value.startswith("/"):
        return ("курс принимает только относительный путь из букв, цифр и . _ / - (без ~, :, @, URL и абсолютного "
                "пути)")
    if value.lower().startswith("github.com/"):
        return "compose читает github.com/... как адрес Git-репозитория, а не как папку"
    normalised = posixpath.normpath(joined)
    if normalised == ".." or normalised.startswith("../"):
        return "путь выходит из репозитория через .."
    root = workspace.resolve()
    if not (workspace / normalised).resolve().is_relative_to(root):
        return "путь выходит из репозитория через символическую ссылку"
    return None


def build_dockerfile(workspace: Path, service: str, build: object) -> tuple[str | None, str | None]:
    """(workspace-relative Dockerfile path, problem)."""
    if isinstance(build, ds.Scalar):
        context, dockerfile = build, None
    elif isinstance(build, ds.Mapping) and isinstance(build.get("context"), ds.Scalar):
        extra = [key for key in build if key not in BUILD_KEYS]
        if extra:
            return None, refused_key(extra[0], f"в build сервиса {service}", BUILD_KEYS, build.line)
        context, dockerfile = build["context"], build.get("dockerfile")
        if dockerfile is not None and not isinstance(dockerfile, ds.Scalar):
            return None, f"{COMPOSE}: строка {build.line}: build.dockerfile сервиса {service} должен быть строкой с путём"
    else:
        return None, f"{COMPOSE}: у сервиса {service} нужен build: путь к контексту или context (и dockerfile)"
    for key, value in (("context", context), ("dockerfile", dockerfile)):
        if value is None:
            continue
        joined = str(context) if key == "context" else posixpath.join(str(context), str(value))
        reason = path_problem(workspace, str(value), joined)
        if reason:
            return None, (f"{COMPOSE}: строка {value.line}: build сервиса {service} должен указывать внутрь репозитория: "
                          f"{key} {value}: {reason}")
    path = posixpath.normpath(posixpath.join(str(context), str(dockerfile or "Dockerfile")))
    return path, None


def build_arg_names(node: object) -> list[ds.Scalar]:
    if isinstance(node, ds.Sequence):
        return [ds.Scalar(str(item).partition("=")[0], item.line) for item in node if isinstance(item, ds.Scalar)]
    if isinstance(node, ds.Mapping):
        return [key for key in node if isinstance(key, ds.Scalar)]
    return []


def build_problems(service: str, build: object, dockerfile: ds.Dockerfile) -> list[str]:
    """build.args and build.target judged against the Dockerfile they feed."""
    if not isinstance(build, ds.Mapping):
        return []
    problems = []
    for name in build_arg_names(build.get("args")):
        if name.upper().startswith("BUILDKIT_"):
            problems.append(f"{COMPOSE}: строка {name.line}: build.args сервиса {service} задаёт {name}: аргументы "
                            "BUILDKIT_ настраивают сам BuildKit (BUILDKIT_SYNTAX подменяет программу, которая читает "
                            "Dockerfile), проверка их не читает; уберите его из args")
        elif name in dockerfile.global_args:
            problems.append(f"{COMPOSE}: строка {name.line}: build.args сервиса {service} задаёт {name}, а это ARG до "
                            "первого FROM: он выбирает базовый образ, который проверка читала по значению по умолчанию; "
                            "уберите его из args")
    target = build.get("target")
    final = dockerfile.stages[-1]
    if target is None or str(target).lower() == final.name:
        return problems
    line = target.line if isinstance(target, ds.Scalar) else build.line
    chosen = next((stage for stage in dockerfile.stages[:-1] if stage.name == str(target).lower()), None)
    if chosen is not None:
        problems.append(f"{COMPOSE}: строка {line}: build.target {target} сервиса {service} выбирает стадию {chosen.name} "
                        f"(строка {chosen.line}), а не последнюю, которую читает проверка (её базовый образ и USER); "
                        "уберите target")
    else:
        problems.append(f"{COMPOSE}: строка {line}: build.target {target} сервиса {service} не совпадает с именем последней "
                        f"стадии ({final.name or 'у неё нет AS'}), которую читает проверка; уберите target или напишите имя "
                        "как в AS")
    return problems


def volume_problems(service: str, node: object, declared: object) -> list[str]:
    if node is None:
        return []
    names = set(declared) if isinstance(declared, ds.Mapping) else set()
    if not isinstance(node, ds.Sequence):
        return [f"{COMPOSE}: volumes сервиса {service} должен быть списком ИМЯ:/путь"]
    problems = []
    for item in node:
        match = NAMED_VOLUME.match(str(item)) if isinstance(item, ds.Scalar) else None
        if match is None or match.group(1) not in names:
            line = item.line if isinstance(item, (ds.Scalar, ds.Mapping)) else node.line
            problems.append(f"{COMPOSE}: строка {line}: volumes сервиса {service}: курс принимает только именованный том из "
                            "раздела volumes в форме ИМЯ:/путь; путь хоста (bind) открывает контейнеру файлы машины")
    return problems


def healthcheck_key_problems(service: str, healthcheck: object) -> list[str]:
    if not isinstance(healthcheck, ds.Mapping):
        return []
    return [refused_key(key, f"в healthcheck сервиса {service}", HEALTHCHECK_KEYS, healthcheck.line)
            for key in healthcheck if key not in HEALTHCHECK_KEYS]


def environment(service: str, node: object) -> tuple[dict[str, str], list[str]]:
    if node is None:
        return {}, []
    values: dict[str, str] = {}
    if isinstance(node, ds.Sequence):
        for item in node:
            if not isinstance(item, ds.Scalar) or "=" not in item:
                return {}, [f"{COMPOSE}: environment сервиса {service}: элемент списка пишется как ИМЯ=значение"]
            name, _, value = item.partition("=")
            values[name] = value
    elif isinstance(node, ds.Mapping):
        for name, value in node.items():
            values[str(name)] = str(value) if value is not None else ""
    else:
        return {}, [f"{COMPOSE}: environment сервиса {service} должен быть списком или словарём"]
    return values, []


def depends_on(node: object) -> set[str]:
    if isinstance(node, ds.Sequence):
        return {str(item) for item in node if isinstance(item, ds.Scalar)}
    if isinstance(node, ds.Mapping):
        return {str(name) for name in node}
    return set()


def check_dockerfile(workspace: Path, relative: str, service: str) -> tuple[ds.Dockerfile | None, list[str]]:
    text, refused = read_regular(workspace, relative)
    if refused:
        return None, [refused]
    if text is None:
        return None, [f"нет файла {relative}: его собирает build сервиса {service} в {COMPOSE}"]
    try:
        dockerfile = ds.parse_dockerfile(text)
    except ds.DockerfileError as error:
        return None, [f"{relative}: {error}"]
    problems = []
    user = dockerfile.effective_user()
    final = dockerfile.stages[-1]
    if user is None:
        problems.append(f"{relative}: у последней стадии (строка {final.line}) нет USER ни в ней, ни в стадиях, от которых "
                        "она строится: напишите USER явно, например USER nonroot:nonroot или USER 65532:65532 "
                        "(статическая проверка не видит пользователя по умолчанию в образе)")
    elif user[0] == "root" or (user[0].isdigit() and int(user[0]) == 0):
        problems.append(f"{relative}: строка {user[1]}: USER {user[0]}: последняя стадия работает от root (uid 0); нужен "
                        "другой пользователь")
    return dockerfile, problems + chain_problems(relative, dockerfile)


def chain_problems(relative: str, dockerfile: ds.Dockerfile) -> list[str]:
    """ONBUILD in a parent of the final stage, test variables declared anywhere in the final stage chain."""
    chain = dockerfile.chain()
    problems = [f"{relative}: строка {line}: ONBUILD в стадии {stage.name}, от которой строится последняя стадия: "
                "BuildKit выполняет его в стадии, которая строится от неё, и его результат попадает в последнюю "
                "стадию, а проверка его не читает; уберите ONBUILD"
                for stage in chain[:-1] for line in stage.onbuild_lines]
    problems += [f"{relative}: строка {line}: {keyword} {name} в цепочке последней стадии: это переменная тестов, в "
                 "образе её быть не должно"
                 for stage in chain for keyword, name, line in stage.variables if name in TEST_VARIABLES]
    return problems


def service_key_problems(name: str, service: ds.Mapping) -> list[str]:
    problems = []
    if "env_file" in service:
        problems.append(f"{COMPOSE}: env_file у сервиса {name} проверка не читает; переменные пишите в environment")
    if name != "web" and "ports" in service:
        problems.append(f"{COMPOSE}: сервис {name} публикует порты; наружу открыт только web")
    allowed = SERVICE_KEYS[name]
    problems += [refused_key(key, f"у сервиса {name}", allowed, service.line)
                 for key in service if key not in allowed and key not in ("env_file", "ports")]
    return problems


def service_problems(workspace: Path, root: ds.Mapping, name: str, service: ds.Mapping) -> tuple[ds.Dockerfile | None, list[str]]:
    problems = service_key_problems(name, service)
    values, env_problems = environment(name, service.get("environment"))
    problems += env_problems
    for variable in TEST_VARIABLES:
        if variable in values:
            problems.append(f"{COMPOSE}: {variable} у сервиса {name}: это переменная тестов, в развёртывании её быть "
                            "не должно")
    problems += healthcheck_key_problems(name, service.get("healthcheck"))
    if name == "api":
        problems += volume_problems(name, service.get("volumes"), root.get("volumes"))
    path, problem = build_dockerfile(workspace, name, service.get("build"))
    if problem:
        return None, problems + [problem]
    assert path is not None
    dockerfile, more = check_dockerfile(workspace, path, name)
    problems += more
    if dockerfile is not None:
        problems += build_problems(name, service.get("build"), dockerfile)
    return dockerfile, problems


def evaluate(workspace: Path) -> tuple[list[str], str]:
    text, refused = read_regular(workspace, COMPOSE)
    if refused:
        return [refused], ""
    if text is None:
        return [f"нет файла {COMPOSE} в корне репозитория"], ""
    problems = other_compose_inputs(workspace)
    try:
        root = ds.parse_compose(text)
    except ds.ComposeError as error:
        return problems + [f"{COMPOSE}: {error}"], ""
    problems += top_level_problems(root)
    services = root.get("services")
    if not isinstance(services, ds.Mapping):
        return problems + [f"{COMPOSE}: нет раздела services"], ""
    for name in SERVICES:
        # A service written as a scalar exists; the loop below reports it as not a mapping.
        if name not in services:
            problems.append(f"{COMPOSE}: нет сервиса {name}")
    for name in services:
        if name not in SERVICES:
            problems.append(f"{COMPOSE}: строка {key_line(name, services.line)}: сервис {name}: курс принимает только "
                            "сервисы api и web, другой сервис проверка не читает")
    if any(name not in services for name in SERVICES):
        return problems, ""
    dockerfiles: dict[str, ds.Dockerfile | None] = {}
    for name in SERVICES:
        service = services[name]
        if not isinstance(service, ds.Mapping):
            problems.append(f"{COMPOSE}: сервис {name} должен быть словарём")
            continue
        dockerfiles[name], more = service_problems(workspace, root, name, service)
        problems += more
    if not all(isinstance(services[name], ds.Mapping) for name in SERVICES):
        return problems, ""
    problems += web_problems(services["web"])
    problems += healthcheck_problems(services["api"], dockerfiles.get("api"))
    if problems:
        return problems, ""
    return [], (f"Пройдено: {COMPOSE} и Dockerfile сервисов api и web прошли статическую проверку: других файлов, которые "
                "читает docker compose up, нет, в compose только ключи из списка курса, закреплённые базовые образы, "
                "последняя стадия не от root, healthcheck api вызывает сам сервер, наружу открыт только web, переменных "
                "тестов нет. Образы платформа не собирает и не запускает.")


def web_problems(web: ds.Mapping) -> list[str]:
    problems = []
    web_env, _ = environment("web", web.get("environment"))
    if web_env.get("CALENDAR_API_URL") != API_URL:
        problems.append(f"{COMPOSE}: у web в environment нужно CALENDAR_API_URL={API_URL}")
    if "api" not in depends_on(web.get("depends_on")):
        problems.append(f"{COMPOSE}: web должен зависеть от api (depends_on)")
    if not isinstance(web.get("ports"), ds.Sequence) or not web["ports"]:
        problems.append(f"{COMPOSE}: web должен публиковать порт (ports)")
    return problems


def healthcheck_problems(api: ds.Mapping, dockerfile: ds.Dockerfile | None) -> list[str]:
    healthcheck = api.get("healthcheck")
    test = healthcheck.get("test") if isinstance(healthcheck, ds.Mapping) else None
    if not isinstance(test, ds.Sequence) or not all(isinstance(item, ds.Scalar) for item in test):
        return [f"{COMPOSE}: у api нужен healthcheck с test в виде блочного списка: - CMD, путь к серверу, его подкоманда"]
    if len(test) < 3 or test[0] != "CMD":
        return [f"{COMPOSE}: строка {test.line}: healthcheck.test: первым элементом CMD, затем путь к серверу и его "
                "подкоманда (в distroless-образе нет оболочки, curl и wget)"]
    if dockerfile is None:
        return []
    executable = dockerfile.executable()
    if executable is None:
        return [f"{COMPOSE}: у последней стадии образа api нужен ENTRYPOINT или CMD в форме exec (JSON-массив), чтобы "
                "проверка знала путь к серверу"]
    if test[1] != executable:
        return [f"{COMPOSE}: строка {test.line}: healthcheck.test вызывает {test[1]}, а образ api запускает {executable}: "
                "проверка здоровья должна вызывать сам сервер с его подкомандой"]
    return []


def main() -> int:
    problems, passed = evaluate(Path.cwd().resolve())
    if problems:
        print("\n".join(problems))
        return 1
    print(passed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
