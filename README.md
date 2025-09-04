# idempiere-log-parser
This is mean to be run as a service that processes iDempiere log files to parse out GraphQL requests and log those requests, along with specified parameters, to our logging database for analytics.

This was designed on Node 22 and the associated `npm` version.

## Setup
To install this on a new server, do the same you'd do for development. So, install the code, then run
```
npm install
```

## Configuration
Copy the `.env.example` file and rename it to `.env` and set the properties.

## Set up a system process to run this
Do the following:
1. In `/lib/systemd/system/idempiere-log-parser.service`, create the `idempiere-log-parser.service` and populate it with the same contents as that file in this repository.
2. Reload the daemon by `sudo systemctl daemon-reload`.
3. Ensure SystemD will automatically start the service by running `sudo systemctl enable data-integrity-alerter`.
3. Start the service `sudo systemctl start data-integrity-alerter`.
4. (Optional) Check the service status `sudo systemctl status idempiere-log-parser`.
