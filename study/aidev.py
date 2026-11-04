"""Shared DuckDB views over the pinned AIDev v5 tables.

Requester and decider are defined once here so the sample, the outcomes and the report agree.
- requester: the PR author when the author is a person; for an agent-authored PR (Copilot, Devin, Jules,
  claude[bot], cursor[bot]) the person who started the agent (first copilot_work_started actor, else the
  person the agent bot assigned).
- decider: the actor of the merge event for a merged PR, the actor of the last close event otherwise.
- independent decision: a closed PR whose decider is known and is neither the author nor the requester.
"""

import os

import duckdb

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")


def connect() -> duckdb.DuckDBPyConnection:
    c = duckdb.connect()
    c.execute("SET memory_limit='6GB'")
    c.execute(f"CREATE VIEW pr AS SELECT * FROM '{RAW}/pull_request.parquet'")
    c.execute(f"CREATE VIEW tl AS SELECT * FROM '{RAW}/pr_timeline.parquet'")
    c.execute(f"CREATE VIEW repo AS SELECT * FROM '{RAW}/repository.parquet'")
    c.execute(f"CREATE VIEW rv AS SELECT * FROM '{RAW}/pr_reviews.parquet'")
    c.execute(
        """
        CREATE TABLE decisions AS
        WITH cws AS (
            SELECT pr_id, arg_min(actor, created_at) a FROM tl
            WHERE event = 'copilot_work_started' AND actor IS NOT NULL GROUP BY 1
        ), botasg AS (
            SELECT tl.pr_id, arg_min(tl.assignee, tl.created_at) a FROM tl JOIN pr ON pr.id = tl.pr_id
            WHERE tl.event = 'assigned' AND tl.actor = pr.user AND tl.assignee IS NOT NULL
              AND tl.assignee <> pr.user GROUP BY 1
        ), m AS (
            SELECT pr_id, arg_min(actor, created_at) a FROM tl WHERE event = 'merged' GROUP BY 1
        ), cl AS (
            SELECT pr_id, arg_max(actor, created_at) a FROM tl WHERE event = 'closed' GROUP BY 1
        )
        SELECT pr.id AS pr_id, pr.number, pr.repo_id, pr.agent, pr.user AS author, pr.state,
               pr.created_at, pr.closed_at, pr.merged_at,
               CASE WHEN pr.user NOT LIKE '%[bot]' AND pr.user <> 'Copilot' THEN pr.user
                    ELSE coalesce(cws.a, botasg.a) END AS requester,
               CASE WHEN pr.merged_at IS NOT NULL THEN m.a WHEN pr.state = 'closed' THEN cl.a END AS decider
        FROM pr
        LEFT JOIN cws ON cws.pr_id = pr.id
        LEFT JOIN botasg ON botasg.pr_id = pr.id
        LEFT JOIN m ON m.pr_id = pr.id
        LEFT JOIN cl ON cl.pr_id = pr.id
        """
    )
    c.execute(
        """
        CREATE VIEW independent AS
        SELECT * FROM decisions
        WHERE state = 'closed' AND decider IS NOT NULL AND requester IS NOT NULL
          AND decider <> requester AND decider <> author
        """
    )
    return c
