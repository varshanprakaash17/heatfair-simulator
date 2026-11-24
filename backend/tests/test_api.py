"""End-to-end API tests against a temporary SQLite database."""

from __future__ import annotations


def _bootstrap(client):
    response = client.get("/api/v1/demo/bootstrap")
    assert response.status_code == 200
    return response.json()


def _run(client, bootstrap, policy_index=0, scenario_index=1, population=200, seed=42):
    payload = {
        "organization_id": bootstrap["organization"]["id"],
        "policy_id": bootstrap["policies"][policy_index]["id"],
        "scenario_id": bootstrap["scenarios"][scenario_index]["id"],
        "population_size": population,
        "random_seed": seed,
        "simulation_duration_days": 1,
    }
    return client.post("/api/v1/simulations/run", json=payload)


def test_health(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


def test_demo_bootstrap_seeds_required_entities(client):
    data = _bootstrap(client)
    assert data["is_demo"] is True
    assert len(data["policies"]) >= 3
    assert len(data["scenarios"]) >= 3
    names = {scenario["name"] for scenario in data["scenarios"]}
    assert {"Normal working conditions", "Hot working conditions", "Extreme heat scenario"} <= names
    assert data["latest_simulation"] is not None


def test_dashboard_uses_stored_simulation(client):
    data = _bootstrap(client)
    response = client.get(
        "/api/v1/dashboard", params={"organization_id": data["organization"]["id"]}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["latest"] is not None
    assert body["latest"]["metrics"]["exposure_index"] > 0
    assert body["counts"]["synthetic_workers"] == 500
    assert len(body["recent_simulations"]) >= 1


def test_simulation_run_and_results_roundtrip(client):
    data = _bootstrap(client)
    response = _run(client, data)
    assert response.status_code == 201, response.text
    body = response.json()
    simulation_id = body["simulation"]["id"]
    metrics = body["results"]["metrics"]
    for key in (
        "exposure_index",
        "break_accessibility",
        "income_retention",
        "operational_disruption",
        "incentive_pressure_index",
    ):
        assert key in metrics
    assert 0 <= metrics["exposure_index"] <= 100

    stored = client.get(f"/api/v1/simulations/{simulation_id}/results")
    assert stored.status_code == 200
    assert stored.json()["metrics"]["exposure_index"] == metrics["exposure_index"]
    assert len(stored.json()["hourly"]) >= 8
    assert stored.json()["assumptions"]["model_version"]


def test_simulation_inputs_change_results(client):
    data = _bootstrap(client)
    low = _run(client, data, policy_index=0, scenario_index=0, seed=3)
    high = _run(client, data, policy_index=0, scenario_index=2, seed=3)
    assert low.status_code == 201 and high.status_code == 201
    assert (
        high.json()["results"]["metrics"]["exposure_index"]
        > low.json()["results"]["metrics"]["exposure_index"]
    )


def test_optimizer_returns_pareto_frontier_and_persists(client):
    data = _bootstrap(client)
    simulation_id = _run(client, data).json()["simulation"]["id"]

    missing = client.get(f"/api/v1/simulations/{simulation_id}/pareto")
    assert missing.status_code == 404

    response = client.post(
        f"/api/v1/simulations/{simulation_id}/optimize",
        json={"candidate_count": 16, "seed": 42, "population_size": 200},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["evaluated"] == 16
    assert body["frontier"]
    assert all(item["on_frontier"] for item in body["frontier"])
    # The frontier must be non-dominated: no candidate strictly dominates another.
    for candidate in body["frontier"]:
        for other in body["frontier"]:
            if candidate["id"] == other["id"]:
                continue
            objectives = candidate["objectives"]
            other_objectives = other["objectives"]
            worse_or_equal = all(objectives[k] <= other_objectives[k] for k in objectives)
            strictly = any(objectives[k] < other_objectives[k] for k in objectives)
            assert not worse_or_equal or not strictly

    stored = client.get(f"/api/v1/simulations/{simulation_id}/pareto")
    assert stored.status_code == 200
    assert len(stored.json()["frontier"]) == len(body["frontier"])


def test_apply_candidate_creates_policy_and_simulation(client):
    data = _bootstrap(client)
    simulation_id = _run(client, data).json()["simulation"]["id"]
    optimization = client.post(
        f"/api/v1/simulations/{simulation_id}/optimize",
        json={"candidate_count": 12, "seed": 1, "population_size": 150},
    ).json()
    candidate_id = optimization["frontier"][0]["id"]

    applied = client.post(
        f"/api/v1/simulations/{simulation_id}/apply",
        json={"candidate_id": candidate_id, "run_simulation": True, "population_size": 200},
    )
    assert applied.status_code == 201, applied.text
    body = applied.json()
    assert body["policy"]["id"]
    assert body["simulation"]["status"] == "completed"
    assert body["results"]["metrics"]["exposure_index"] >= 0

    policies = client.get(
        "/api/v1/policies", params={"organization_id": data["organization"]["id"]}
    ).json()
    assert body["policy"]["id"] in {policy["id"] for policy in policies}


def test_report_generates_pdf_and_record(client):
    data = _bootstrap(client)
    simulation_id = _run(client, data).json()["simulation"]["id"]
    response = client.get(f"/api/v1/simulations/{simulation_id}/report")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert len(response.content) > 5000

    reports = client.get("/api/v1/reports", params={"simulation_id": simulation_id}).json()
    assert reports and reports[0]["report_url"].endswith(".pdf")


def test_policy_crud_and_validation(client):
    data = _bootstrap(client)
    org_id = data["organization"]["id"]

    created = client.post(
        "/api/v1/policies",
        json={
            "organization_id": org_id,
            "name": "API test policy",
            "deadline_pressure": 0.9,
            "bonus_dependency": 0.8,
            "penalty_severity": 0.6,
            "break_compensation": 0.25,
            "protected_break_minutes": 30,
            "flexible_deadlines": False,
            "budget_limit": 12,
        },
    )
    assert created.status_code == 201
    policy = created.json()
    assert 0 <= policy["incentive_pressure_index"] <= 100

    updated = client.put(
        f"/api/v1/policies/{policy['id']}", json={"protected_break_minutes": 90}
    )
    assert updated.status_code == 200
    assert updated.json()["protected_break_minutes"] == 90

    invalid = client.post(
        "/api/v1/policies",
        json={"organization_id": org_id, "name": "Bad policy", "deadline_pressure": 5},
    )
    assert invalid.status_code == 422
    assert invalid.json()["status"] == 422

    duplicate = client.post(
        "/api/v1/policies",
        json={
            "organization_id": org_id,
            "name": "API test policy",
            "deadline_pressure": 0.5,
            "bonus_dependency": 0.5,
            "penalty_severity": 0.5,
            "break_compensation": 0,
            "protected_break_minutes": 0,
            "flexible_deadlines": False,
            "budget_limit": 5,
        },
    )
    assert duplicate.status_code == 409


def test_scenario_creation_and_hourly_series(client):
    created = client.post(
        "/api/v1/scenarios",
        json={
            "name": "API custom hourly",
            "temperature": 37,
            "humidity": 55,
            "work_duration": 4,
            "work_intensity": "heavy",
            "shift_start_hour": 9,
            "hourly_conditions": [
                {"hour": 9, "temperature": 35, "humidity": 60},
                {"hour": 10, "temperature": 38, "humidity": 55},
            ],
            "source": "custom-hourly",
        },
    )
    assert created.status_code == 201
    scenario = created.json()
    assert scenario["hourly_conditions"][0]["temperature"] == 35
    assert scenario["hourly_preview"][0]["heat_index"] > 30

    hourly = client.get(f"/api/v1/scenarios/{scenario['id']}/hourly")
    assert hourly.status_code == 200
    assert len(hourly.json()["hourly"]) >= 2

    invalid = client.post(
        "/api/v1/scenarios",
        json={"name": "Bad scenario", "temperature": 200, "humidity": 10},
    )
    assert invalid.status_code == 422


def test_worker_generation_and_persistence(client):
    data = _bootstrap(client)
    response = client.post(
        "/api/v1/workers/generate",
        json={"organization_id": data["organization"]["id"], "size": 100, "seed": 21},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["size"] == 100
    assert body["persisted"] is True

    workers = client.get(
        "/api/v1/workers", params={"organization_id": data["organization"]["id"], "limit": 10}
    ).json()
    assert workers["total"] == 100
    assert workers["workers"][0]["synthetic"] is True


def test_not_found_paths(client):
    assert client.get("/api/v1/simulations/does-not-exist").status_code == 404
    assert client.get("/api/v1/policies/does-not-exist").status_code == 404
    response = client.post(
        "/api/v1/simulations/run",
        json={
            "organization_id": "missing",
            "policy_id": "missing",
            "scenario_id": "missing",
            "population_size": 100,
            "random_seed": 1,
            "simulation_duration_days": 1,
        },
    )
    assert response.status_code == 404


def test_cors_headers_present(client):
    response = client.get("/api/v1/health", headers={"Origin": "http://localhost:3000"})
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
