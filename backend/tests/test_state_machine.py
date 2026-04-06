"""Tests for the pure invoice state machine.

Covers every valid transition and asserts invalid transitions raise.
"""
from __future__ import annotations

import pytest

from app.services.state_machine import (
    ACTION_GENERATE_PDF,
    ACTION_RECORD_SUBMISSION,
    ACTION_SEND_NEEDS_INFO_REPLY,
    ACTION_SEND_VERIFIED_REPLY,
    ACTION_START_EXTRACTION,
    DEFAULT_CONFIDENCE_THRESHOLD,
    DISPUTE_RESOLVED,
    DRIVER_PROVIDED_TEXT,
    EXTRACTION_COMPLETE,
    InvalidTransitionError,
    InvoiceState,
    PHOTO_RECEIVED,
    USER_SUBMITS_TO_GOV,
    VENDOR_FLAGS_DISPUTE,
    VENDOR_OVERRIDE,
    can_transition,
    determine_target_state_after_extraction,
    next_state,
)


# ---------------------------------------------------------------------------
# Happy-path transitions
# ---------------------------------------------------------------------------
class TestHappyPathTransitions:
    def test_pending_to_verifying_on_photo(self):
        state, actions = next_state(InvoiceState.PENDING, PHOTO_RECEIVED)
        assert state == InvoiceState.VERIFYING
        assert ACTION_START_EXTRACTION in actions

    def test_verifying_to_verified_on_high_quality_extraction(self):
        ctx = {
            "confidence": 0.95,
            "missing_fields": [],
            "has_block_edge_case": False,
        }
        state, actions = next_state(
            InvoiceState.VERIFYING, EXTRACTION_COMPLETE, ctx
        )
        assert state == InvoiceState.VERIFIED
        assert ACTION_GENERATE_PDF in actions
        assert ACTION_SEND_VERIFIED_REPLY in actions

    def test_verifying_to_needs_info_on_low_confidence(self):
        ctx = {
            "confidence": 0.3,
            "missing_fields": [],
            "has_block_edge_case": False,
        }
        state, actions = next_state(
            InvoiceState.VERIFYING, EXTRACTION_COMPLETE, ctx
        )
        assert state == InvoiceState.NEEDS_INFO
        assert ACTION_SEND_NEEDS_INFO_REPLY in actions

    def test_verifying_to_needs_info_on_missing_field(self):
        ctx = {
            "confidence": 0.99,
            "missing_fields": ["date_of_acceptance"],
            "has_block_edge_case": False,
        }
        state, _ = next_state(InvoiceState.VERIFYING, EXTRACTION_COMPLETE, ctx)
        assert state == InvoiceState.NEEDS_INFO

    def test_verifying_to_needs_info_on_blocking_edge_case(self):
        ctx = {
            "confidence": 0.99,
            "missing_fields": [],
            "has_block_edge_case": True,
        }
        state, _ = next_state(InvoiceState.VERIFYING, EXTRACTION_COMPLETE, ctx)
        assert state == InvoiceState.NEEDS_INFO

    def test_needs_info_to_verifying_on_driver_text(self):
        state, actions = next_state(
            InvoiceState.NEEDS_INFO, DRIVER_PROVIDED_TEXT, {}
        )
        assert state == InvoiceState.VERIFYING
        assert ACTION_START_EXTRACTION in actions

    def test_needs_info_to_verified_on_vendor_override(self):
        state, actions = next_state(InvoiceState.NEEDS_INFO, VENDOR_OVERRIDE, {})
        assert state == InvoiceState.VERIFIED
        assert ACTION_GENERATE_PDF in actions

    def test_verified_to_submitted_on_submit_to_gov(self):
        state, actions = next_state(
            InvoiceState.VERIFIED, USER_SUBMITS_TO_GOV, {}
        )
        assert state == InvoiceState.SUBMITTED_TO_GOV
        assert ACTION_RECORD_SUBMISSION in actions

    def test_verified_to_disputed(self):
        state, _ = next_state(InvoiceState.VERIFIED, VENDOR_FLAGS_DISPUTE, {})
        assert state == InvoiceState.DISPUTED

    def test_submitted_to_gov_to_disputed(self):
        state, _ = next_state(
            InvoiceState.SUBMITTED_TO_GOV, VENDOR_FLAGS_DISPUTE, {}
        )
        assert state == InvoiceState.DISPUTED

    def test_disputed_to_verified_on_resolution(self):
        state, _ = next_state(InvoiceState.DISPUTED, DISPUTE_RESOLVED, {})
        assert state == InvoiceState.VERIFIED


# ---------------------------------------------------------------------------
# Invalid transitions
# ---------------------------------------------------------------------------
class TestInvalidTransitions:
    def test_pending_on_extraction_complete_raises(self):
        with pytest.raises(InvalidTransitionError):
            next_state(InvoiceState.PENDING, EXTRACTION_COMPLETE, {})

    def test_verified_on_photo_received_raises(self):
        with pytest.raises(InvalidTransitionError):
            next_state(InvoiceState.VERIFIED, PHOTO_RECEIVED, {})

    def test_disputed_on_user_submits_raises(self):
        with pytest.raises(InvalidTransitionError):
            next_state(InvoiceState.DISPUTED, USER_SUBMITS_TO_GOV, {})

    def test_needs_info_on_submit_raises(self):
        with pytest.raises(InvalidTransitionError):
            next_state(InvoiceState.NEEDS_INFO, USER_SUBMITS_TO_GOV, {})

    def test_unknown_event_raises(self):
        with pytest.raises(InvalidTransitionError):
            next_state(InvoiceState.PENDING, "not_a_real_event", {})


# ---------------------------------------------------------------------------
# can_transition + determine_target_state_after_extraction
# ---------------------------------------------------------------------------
class TestHelpers:
    def test_can_transition_true(self):
        assert can_transition(InvoiceState.PENDING, PHOTO_RECEIVED, {}) is True

    def test_can_transition_false(self):
        assert (
            can_transition(InvoiceState.VERIFIED, PHOTO_RECEIVED, {}) is False
        )

    def test_determine_target_state_high_quality(self):
        state = determine_target_state_after_extraction(
            confidence=0.95, missing_fields=[], has_block_edge_case=False
        )
        assert state == InvoiceState.VERIFIED

    def test_determine_target_state_low_confidence(self):
        state = determine_target_state_after_extraction(
            confidence=0.5, missing_fields=[], has_block_edge_case=False
        )
        assert state == InvoiceState.NEEDS_INFO

    def test_determine_target_state_block_forces_needs_info(self):
        state = determine_target_state_after_extraction(
            confidence=0.99, missing_fields=[], has_block_edge_case=True
        )
        assert state == InvoiceState.NEEDS_INFO

    def test_next_state_accepts_string_current(self):
        state, _ = next_state("PENDING", PHOTO_RECEIVED, {})
        assert state == InvoiceState.VERIFYING

    def test_default_confidence_threshold_is_85(self):
        assert DEFAULT_CONFIDENCE_THRESHOLD == 0.85
