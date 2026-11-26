# OpenDispatch

Confirm whether the operator delivers its own invoiced orders or bills a customer for delivery. Keep the recipient and payer distinct. Preserve external invoice references. Only offer actions supported by the installed version.

## Delivery route schedules

The open route in Clawnify chat is identified by its route UUID. Read
`GET /api/delivery/routes/{id}/schedule` to resolve the numbered stop to its ID
and see its current timing revision. Patch the same URL with the revision and
only the requested fields. For example, changing one stop to 20 minutes uses
`{"revision":"<latest revision>","stops":[{"id":"<stop ID>","serviceMinutes":20}]}`.
Use null for the first revision, or for a stop's serviceMinutes to restore its
route default. The route's start and a stop's earliest service time are HH:mm
on the delivery date in local time. Read the resulting schedule for the new
finish. A null schedule means road leg times still need calculating in Plan route.
