#!/bin/bash
# Generator guards on the real sdd_probegen.py (L1 checks; L7 holds a byte-identical copy).
set -u
G=plans/41-module-spec-driven-development-demo-A/guards; C=course/ai-for-developers/01-spec-driven-development/01-verification/checks
python3 --version
for f in $C/sdd_probegen.py $G/control_sumleak.py $G/control_genleak.py $G/control_tokflow.py $G/control_tokleak.py $G/control_stubleak.py; do echo -n "$(basename $f): "; python3 -I $G/state_flow.py $f; done
python3 -I $G/text_guard.py $C 1000
python3 -I $G/text_guard.py $C 1000 stub
for m in offset half sum; do python3 -I $G/text_guard.py $C 300 $m; done
python3 -I $G/meta_guard.py $C 1000 grader
python3 -I $G/meta_guard.py $C 300 r5order
python3 -I $G/meta_guard.py $C 300 drawfirst
