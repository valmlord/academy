#!/bin/bash
# static_ast rerun on L1 (adapted to the real base layout), then L7 attackers wrapped with a linter call.
set -u
D=plans/41-module-spec-driven-development-demo-A; C1=course/ai-for-developers/01-spec-driven-development/01-verification/checks
C=course/ai-for-developers/01-spec-driven-development/07-integrity-control/checks; H=$D/attacks/hooks_l7
python3 -I $D/train_static.py $C1
python3 -I $D/hook_attacks.py $C1 $D/attacks/hooks/static_ast.py 20
python3 -I $D/hook_attacks.py $C $C/reference/.claude/hooks/stop_tests.py 3 --l7
rm -f /tmp/m3_hookctr; python3 -I $D/hook_attacks.py $C $H/atk_counter_grep.py 2 --fixed --l7 --reset /tmp/m3_hookctr
python3 -I $D/hook_attacks.py $C $H/atk_counter_grep.py 20 --l7 --reset /tmp/m3_hookctr
python3 -I $D/hook_attacks.py $C $H/atk_static_off.py 20 --l7
python3 -I $D/hook_attacks.py $C $H/atk_static_ast.py 20 --l7
python3 -I $D/hook_attacks.py $C $H/atk_mtime_off.py 20 --l7
rm -f /tmp/judge_r4_gap /tmp/judge_r4_gaplog; python3 -I $D/hook_attacks.py $C $H/atk_gap_mem.py 20 --l7
python3 -I $D/hook_attacks.py $C $H/atk_generic_eval.py 10 --l7
python3 -I $D/hook_attacks.py $C $H/atk_memory_guess.py 100 --l7 --reset '/tmp/m3_mem_*'
