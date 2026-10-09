-- Grafana-ready queries for GO-3774 client error logs.
-- Join keys live in JSON (no extra first-class columns).
-- Client clinic: user_context->>'clientId'
-- Client request / incident / fingerprint: variables->'data'->>'…'
-- Server request / errors: variables->>'requestId', variables->'graphqlErrors'

-- New fingerprints in the last 24 hours (not seen in the prior 14 days)
SELECT
	variables->'data'->>'fingerprint' AS fingerprint,
	COUNT(*) AS cnt,
	MIN(log_time) AS first_seen
FROM idempiere_log
WHERE log_time >= NOW() - INTERVAL '24 hours'
  AND query_type = 'log'
  AND query_name = 'Log'
  AND variables->>'type' IN ('error', 'graphql_error', 'react_error')
  AND COALESCE(variables->'data'->>'fingerprint', '') <> ''
  AND variables->'data'->>'fingerprint' NOT IN (
	SELECT DISTINCT variables->'data'->>'fingerprint'
	FROM idempiere_log
	WHERE log_time >= NOW() - INTERVAL '15 days'
	  AND log_time < NOW() - INTERVAL '24 hours'
	  AND query_type = 'log'
	  AND query_name = 'Log'
	  AND COALESCE(variables->'data'->>'fingerprint', '') <> ''
  )
GROUP BY 1
ORDER BY cnt DESC;

-- Clinic spike: one client with 3x its 7-day daily average today
SELECT
	user_context->>'clientId' AS client_id,
	COUNT(*) AS today_cnt
FROM idempiere_log
WHERE log_time >= CURRENT_DATE
  AND query_type = 'log'
  AND query_name = 'Log'
  AND variables->>'type' IN ('error', 'graphql_error', 'react_error')
GROUP BY 1
HAVING COUNT(*) >= 9
   AND COUNT(*) >= 3 * (
	SELECT GREATEST(1, COUNT(*) / 7.0)
	FROM idempiere_log prior
	WHERE prior.log_time >= CURRENT_DATE - INTERVAL '7 days'
	  AND prior.log_time < CURRENT_DATE
	  AND prior.query_type = 'log'
	  AND prior.query_name = 'Log'
	  AND prior.variables->>'type' IN ('error', 'graphql_error', 'react_error')
	  AND prior.user_context->>'clientId' = idempiere_log.user_context->>'clientId'
   )
ORDER BY today_cnt DESC;

-- Timeout / Unauthorized surge in the last hour
SELECT
	COALESCE(variables->'data'->>'operation', query_name) AS operation,
	COUNT(*) AS cnt
FROM idempiere_log
WHERE log_time >= NOW() - INTERVAL '1 hour'
  AND (
	(query_type = 'log' AND query_name = 'Log' AND (
		variables::text ILIKE '%timeout%'
		OR variables::text ILIKE '%Unauthorized%'
	))
	OR (
		query_type IN ('query', 'mutation')
		AND (
			error_data ILIKE '%timeout%'
			OR error_data ILIKE '%Unauthorized%'
			OR variables::text ILIKE '%timeout%'
			OR variables::text ILIKE '%Unauthorized%'
		)
	)
  )
GROUP BY 1
ORDER BY cnt DESC;

-- Join a client incident to the server completion line
-- SELECT *
-- FROM idempiere_log client
-- JOIN idempiere_log server
--   ON server.variables->>'requestId' = client.variables->'data'->>'requestId'
--  AND server.query_type IN ('query', 'mutation')
-- WHERE client.query_type = 'log'
--   AND client.variables->'data'->>'incidentId' = 'A1B2C3D4';
