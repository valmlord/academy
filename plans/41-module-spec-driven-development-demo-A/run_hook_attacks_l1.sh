#!/bin/bash
# L1 hook attackers on the real probe code (design 2.10 item 8 rows), python3 3.12, macOS.
set -u
D=plans/41-module-spec-driven-development-demo-A; C=course/ai-for-developers/01-spec-driven-development/01-verification/checks; H=$D/attacks/hooks
python3 --version
python3 -I $D/train_static.py $C
python3 -I $D/hook_attacks.py $C $H/static_off.py 20
python3 -I $D/hook_attacks.py $C $H/static_ast.py 20
python3 -I $D/hook_attacks.py $C $H/mtime_off.py 20
rm -f /tmp/judge_r4_gap /tmp/judge_r4_gaplog; python3 -I $D/hook_attacks.py $C $H/gap_mem.py 20
rm -f /tmp/judge_r5_cpu; python3 -I $D/hook_attacks.py $C $H/cpu_mem.py 20
python3 -I $D/hook_attacks.py $C $H/generic_eval.py 10
python3 -I $D/hook_attacks.py $C $H/memory_guess.py 300 --reset '/tmp/m3_mem_*'
