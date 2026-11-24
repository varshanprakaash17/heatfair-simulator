import pytest

from app.optimizer.pareto import annotate, dominates, normalise, objective_ranges, pareto_front


def test_dominance_definition():
    assert dominates([1, 1, 1], [2, 2, 2]) is True
    assert dominates([1, 2, 2], [2, 2, 2]) is True
    assert dominates([2, 2, 2], [2, 2, 2]) is False   # equal is not better
    assert dominates([1, 3, 1], [2, 2, 2]) is False   # worse on one objective


def test_non_finite_vectors_rejected():
    with pytest.raises(ValueError):
        dominates([float("nan"), 1, 1], [2, 2, 2])
    with pytest.raises(ValueError):
        dominates([1, 1], [2, 2, 3])


def _record(id_, exposure, income_loss, disruption):
    return {
        "id": id_,
        "exposure": exposure,
        "income_loss": income_loss,
        "disruption": disruption,
    }


def test_frontier_excludes_dominated_records():
    records = [
        _record("a", 10, 10, 10),
        _record("b", 20, 20, 20),
        _record("c", 12, 8, 14),
        _record("d", 5, 25, 5),
    ]
    frontier = pareto_front(records)
    ids = {record["id"] for record in frontier}
    assert ids == {"a", "c", "d"}


def test_identical_vectors_are_all_non_dominated():
    records = [_record("a", 1, 1, 1), _record("b", 1, 1, 1)]
    assert len(pareto_front(records)) == 2


def test_annotate_marks_dominated_by():
    records = [_record("a", 1, 1, 1), _record("b", 5, 5, 5)]
    annotated = annotate(records)
    by_id = {record["id"]: record for record in annotated}
    assert by_id["a"]["is_pareto_optimal"] is True
    assert by_id["b"]["is_pareto_optimal"] is False
    assert by_id["b"]["dominated_by"] == "a"


def test_normalisation_preserves_relative_position():
    records = [_record("a", 0, 0, 0), _record("b", 10, 20, 5)]
    ranges = objective_ranges(records)
    normalised = normalise(records[1], ranges)
    assert normalised["exposure"] == pytest.approx(1.0)
    assert normalised["income_loss"] == pytest.approx(1.0)
    low = normalise(records[0], ranges)
    assert low["exposure"] == pytest.approx(0.0)


def test_ranges_handle_empty_input():
    ranges = objective_ranges([])
    assert ranges["exposure"] == {"min": 0.0, "max": 1.0}
