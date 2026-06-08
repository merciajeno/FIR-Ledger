# FIR Ledger

A lightweight architecture for tracking police complaints and FIR progress using hashed audit trails.

## What it is

FIR Ledger is a system design that lets people file complaints and police officers update case progress, while maintaining hashed evidence records and automated mismatch detection.

## How it works

- A person submits a complaint into the system and the complaint is logged as a hashed record.
- Police officers add updates to the complaint status, also hashed for auditability.
- The system forwards statements to a mismatch detection component.
- Any inconsistency between statements and documented evidence is reported to a central authority.
- The central authority is assumed honest and can view evidence and trigger alerts when case stalling or mismatches are found.

## Architecture

1. `people` send complaints.
2. `police officers` update progress of their work.
3. `system` stores hashed complaint and update data.
4. `mismatch detection` analyzes statements and raises red flags.
5. `central authority` receives reports, views evidence, and intervenes if needed.
6. `case stalling prevention` helps ensure timely follow-up.

## Why this exists

The goal is to reduce FIR stalling and increase transparency by creating an auditable chain of complaints and progress updates.


