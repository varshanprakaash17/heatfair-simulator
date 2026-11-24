#!/usr/bin/env bash
# HeatFair API walkthrough — run against a locally running backend.
#
#   cd heatfair
#   bash demo/api-walkthrough.sh
#
# Requires: curl, python (for JSON field extraction).

set -euo pipefail
API="${API:-http://localhost:8000/api/v1}"

json() { python -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

echo "== health =="
curl -s "$API/health" | json "d['status'], d['database'], d['version']"

echo
echo "== demo bootstrap =="
BOOT=$(curl -s "$API/demo/bootstrap")
ORG=$(echo "$BOOT" | json "d['organization']['id']")
POLICY=$(echo "$BOOT" | json "d['policies'][2]['id']")
SCENARIO=$(echo "$BOOT" | json "d['scenarios'][2]['id']")
echo "org=$ORG"
echo "policy=$POLICY"
echo "scenario=$SCENARIO"

echo
echo "== run simulation (income-protection policy, extreme heat) =="
RUN=$(curl -s -X POST "$API/simulations/run" \
  -H "Content-Type: application/json" \
  -d "{\"organization_id\":\"$ORG\",\"policy_id\":\"$POLICY\",\"scenario_id\":\"$SCENARIO\",\"population_size\":500,\"random_seed\":42,\"simulation_duration_days\":1}")
SIM=$(echo "$RUN" | json "d['simulation']['id']")
echo "$RUN" | json "'exposure', d['results']['metrics']['exposure_index'], 'accessibility', d['results']['metrics']['break_accessibility'], 'retention', d['results']['metrics']['income_retention']"
echo "simulation=$SIM"

echo
echo "== stored results =="
curl -s "$API/simulations/$SIM/results" | json "'hourly points', len(d['hourly']), 'workers', d['metrics']['population']['workers']"

echo
echo "== optimisation (Pareto search) =="
PARETO=$(curl -s -X POST "$API/simulations/$SIM/optimize" \
  -H "Content-Type: application/json" \
  -d '{"candidate_count":36,"seed":42,"population_size":400}')
echo "$PARETO" | json "'evaluated', d['evaluated'], 'feasible', d['feasible'], 'frontier', len(d['frontier'])"
CAND=$(echo "$PARETO" | json "d['frontier'][0]['id']")
echo "first Pareto candidate=$CAND"

echo
echo "== apply candidate and re-run =="
APPLIED=$(curl -s -X POST "$API/simulations/$SIM/apply" \
  -H "Content-Type: application/json" \
  -d "{\"candidate_id\":\"$CAND\",\"run_simulation\":true,\"population_size\":500}")
echo "$APPLIED" | json "'new policy', d['policy']['name']"
echo "$APPLIED" | json "'new exposure', d['results']['metrics']['exposure_index'], 'retention', d['results']['metrics']['income_retention']"
NEW_SIM=$(echo "$APPLIED" | json "d['simulation']['id']")

echo
echo "== PDF report =="
curl -s -o /tmp/heatfair-report.pdf "$API/simulations/$NEW_SIM/report"
file /tmp/heatfair-report.pdf 2>/dev/null || ls -la /tmp/heatfair-report.pdf
echo "report written to /tmp/heatfair-report.pdf"

echo
echo "Done. Swagger UI: http://localhost:8000/docs"
