# OpenDispatch: The Open-Source Onfleet Alternative

OpenDispatch is being built for distributors, wholesalers and retailers delivering their own orders, and for couriers running local routes. For a distributor, the delivery receipt belongs to the order already invoiced in its own system. For a courier, completed deliveries can become billable lines for the paying customer.

## Current implementation

This first revision carries over the back office from [OpenFieldService](https://github.com/clawnify/OpenFieldService/tree/2cf5cd77dd8996caa92158504c059b77d206883e), including customer records, staff assignments, scheduling, invoices and saved read-only job packets. The inherited screens still use field-service terminology.

Open Delivery routes and choose a date, paying customer and driver. Paste spreadsheet rows containing the order reference, recipient, address and optional external invoice reference. The dispatcher sees the stops in import order, grouped by driver. A duplicate reference for the same payer rejects the entire import. Importing a manifest preserves existing invoice references without creating an invoice. Subsequent work covers revocable driver links, offline photo and signature capture, single-van route optimization, recipient tracking and delivery billing. Those features are planned.

## Local development

Use Node.js 22 and pnpm. Run `pnpm install --frozen-lockfile`, then `pnpm dev` to initialize the local database and start the UI and API. Run `pnpm test` for the inherited regression suite and `pnpm build` for the production frontend.

## License

MIT. See [LICENSE](LICENSE).
