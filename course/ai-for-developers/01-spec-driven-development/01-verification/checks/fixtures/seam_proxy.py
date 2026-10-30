"""Grader seam proxy, installed as the seam module of the test project (design #41, section 2.6).

Byte-identical for every variant. It checks the interface domain locally, forwards in-domain calls
to the seam server, re-raises forwarded exceptions and checks every answer against the declared
return type. After import the module exposes the seam function only, so importing any other name
from it raises ImportError.
"""

import importlib.util
import json
import os
import sys
import types


def _load_interface() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("seam_interface", os.environ["SEAM_INTERFACE"])
    if spec is None or spec.loader is None:
        raise ImportError("seam interface missing")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _build() -> types.ModuleType:
    interface = _load_interface()
    seam = interface.SEAMS[os.environ["SEAM_NAME"]]
    answer_fd, call_fd = (int(value) for value in os.environ["SEAM_CLIENT_FDS"].split(","))
    answers = os.fdopen(answer_fd, "r", encoding="utf-8")
    calls = os.fdopen(call_fd, "w", encoding="utf-8")
    outside = interface.ARGUMENTS_OUTSIDE.format(name=seam.name)

    def call(*args: object, **kwargs: object) -> object:
        try:
            values = interface.bind_arguments(seam, args, kwargs)
            encoded = [interface.encode(value, spec, seam) for value, spec in zip(values, seam.argument_specs)]
        except interface.DomainError:
            raise TypeError(outside) from None
        calls.write(json.dumps({"fn": seam.name, "args": encoded}) + "\n")
        calls.flush()
        line = answers.readline()
        try:
            response = json.loads(line)
        except ValueError:
            raise RuntimeError("seam: no valid answer") from None
        if isinstance(response, dict) and set(response) == {"ok"}:
            try:
                return interface.decode(response["ok"], seam.return_spec, seam)
            except interface.DomainError:
                raise RuntimeError("seam: no valid answer") from None
        exception = response.get("exc") if isinstance(response, dict) else None
        if isinstance(exception, list) and len(exception) == 2 and all(isinstance(part, str) for part in exception):
            kind, message = exception
            raise interface.FORWARDED_EXCEPTIONS.get(kind, RuntimeError)(message)
        raise RuntimeError("seam: no valid answer")

    call.__name__ = call.__qualname__ = seam.name
    public = types.ModuleType(__name__, __doc__)
    public.__file__ = __file__
    setattr(public, seam.name, call)
    return public


sys.modules[__name__] = _build()
