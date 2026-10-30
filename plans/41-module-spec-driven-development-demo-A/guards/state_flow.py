"""State-flow guard (design 2.8, revision 7 plus plan item P3) over the real generator source.

The probe state reaches written files only through the seed selector in draw(); the L7 stub behaviour
only through the selector in draw_stub(). In generate(), `state` appears only as the zero-tests branch
test, the argument of the one draw(state) call and in the tokens assignment; the tokens expression holds
no call and no walrus, and after that line `tokens` and `v` are read only in the return.
usage: state_flow.py <generator.py>
"""

import ast
import sys


def names(node: ast.AST, name: str) -> list[ast.Name]:
    return [n for n in ast.walk(node) if isinstance(n, ast.Name) and n.id == name]


def main() -> int:
    tree = ast.parse(open(sys.argv[1], encoding="utf-8").read())
    fn = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
    errors: list[str] = []
    for f in ("render", "write", "seed_for", "render_stub", "stub_seed_for", "h", "ident"):
        if f in fn and (names(fn[f], "state") or names(fn[f], "behaviour")):
            errors.append(f"{f} uses the state")
    for f, var, sel in (("draw", "state", "pick"), ("draw_stub", "behaviour", None)):
        d = fn[f]
        used = names(d, var)
        if len(used) != 1:
            errors.append(f"{f} uses {var} {len(used)} times")
        if sel:
            assigns = [n for n in ast.walk(d) if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == sel for t in n.targets)]
            if len(assigns) != 1 or not names(assigns[0], var):
                errors.append(f"{var} is not consumed by the single `{sel}` selector")
            index_var = sel
        else:
            index_var = var
        for n in names(d, index_var):
            if isinstance(n.ctx, ast.Load) and not any(isinstance(p, ast.Subscript) and p.slice is n for p in ast.walk(d)):
                errors.append(f"{f}: {index_var} used other than as a seed index")
    g = fn["generate"]
    allowed: set[int] = set()
    token_assign = None
    for n in ast.walk(g):
        if isinstance(n, ast.If) and isinstance(n.test, ast.Compare) and isinstance(n.test.left, ast.Name) \
                and n.test.left.id == "state" and len(n.test.comparators) == 1 \
                and getattr(n.test.comparators[0], "value", None) == "Z":
            allowed.add(id(n.test.left))
        if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "draw":
            allowed.update(id(a) for a in n.args if isinstance(a, ast.Name) and a.id == "state")
        if isinstance(n, ast.Assign) and [getattr(t, "id", None) for t in n.targets] == ["tokens"]:
            token_assign = n
            allowed.update(id(x) for x in names(n.value, "state"))
    bad = [n.lineno for n in names(g, "state") if id(n) not in allowed]
    if bad:
        errors.append(f"generate uses state outside the zero-tests branch, draw(state) and tokens (line {bad})")
    if sum(1 for n in ast.walk(g) if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "draw") != 1:
        errors.append("generate must call draw once")
    if token_assign is None:
        errors.append("generate has no tokens assignment")
    else:
        if any(isinstance(n, (ast.Call, ast.NamedExpr)) for n in ast.walk(token_assign.value)):
            errors.append("the tokens expression holds a call or a walrus")
        returns = [n for n in ast.walk(g) if isinstance(n, ast.Return) and n.lineno > token_assign.lineno]
        in_return = {id(x) for r in returns for x in ast.walk(r)}
        for var in ("tokens", "v"):
            for n in names(g, var):
                if n.lineno > token_assign.end_lineno and id(n) not in in_return:
                    errors.append(f"generate reads {var} after the tokens line outside the return (line {n.lineno})")
    p = fn.get("prepare")
    if p is not None:
        for n in names(p, "state"):
            parent_ok = any(
                (isinstance(q, ast.Call) and getattr(q.func, "id", "") == "generate" and n in q.args)
                or (isinstance(q, ast.Compare) and q.left is n and getattr(q.comparators[0], "value", None) == "Z")
                for q in ast.walk(p))
            if not parent_ok:
                errors.append(f"prepare uses state other than generate(state) and the zero-tests layout (line {n.lineno})")
    print("STATE FLOW", "PASS" if not errors else "FAIL " + "; ".join(errors))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
