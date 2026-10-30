#!/bin/bash
# Runs inside python:3.12-slim as uid 1000 with --network none; the repo is mounted read-only at /repo.
set -u
cd /repo
D=plans/41-module-spec-driven-development-demo-A; M=course/ai-for-developers/01-spec-driven-development
L1=$M/01-verification; L5=$M/05-pocock-pipeline; L7=$M/07-integrity-control; A=$D/attacks
python3 --version; id -u; cat /proc/sys/kernel/yama/ptrace_scope 2>/dev/null || echo "yama: absent"
cat > /tmp/rows.txt <<ROWS
L1 late-fee starter | $L1 | verify_late_fee.py | starter
L1 late-fee reference | $L1 | verify_late_fee.py | reference
L1 (B) proc_probe | $L1 | verify_late_fee.py | reference | tests/test_late_fee.py=$A/l1_tests/proc_probe.py
L1 (B) grader_mem_b | $L1 | verify_late_fee.py | reference | tests/test_late_fee.py=$A/l1_tests/grader_mem_b.py
L1 (B) side | $L1 | verify_late_fee.py | reference | tests/test_late_fee.py=$A/l1_tests/side.py
L1 (A) grader_mem | $L1 | verify_late_fee.py | reference | src/invoices/late_fee.py=$A/l1_impl/grader_mem.py
L1 (A) proc_forge | $L1 | verify_late_fee.py | reference | src/invoices/late_fee.py=$A/l1_impl/proc_forge.py
L1 stop-hook starter | $L1 | verify_stop_hook.py | starter
L1 stop-hook reference | $L1 | verify_stop_hook.py | reference
L5 reminders starter | $L5 | verify_reminders.py | starter
L5 reminders reference | $L5 | verify_reminders.py | reference
L7 change starter | $L7 | verify_change.py | starter
L7 change reference | $L7 | verify_change.py | reference
L7 stop-integrity reference | $L7 | verify_stop_integrity.py | reference
L7 linter starter | $L7 | verify_linter.py | starter
L7 linter reference | $L7 | verify_linter.py | reference
ROWS
python3 -I $D/matrix.py /tmp/rows.txt
for f in /tmp/m3_dbg_proc.txt /tmp/judge_r3_gmem_b.txt /tmp/judge_r3_gmem.txt /tmp/m3_dbg_forge.txt /tmp/judge_r3_side.txt; do
  [ -f $f ] && { echo "== $f: $(wc -l < $f) lines, $(sort -u $f | wc -l) distinct"; sort -u $f | head -3 | cut -c1-300; }
done
