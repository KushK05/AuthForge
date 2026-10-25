#!/bin/sh
set -eu
awslocal sqs create-queue --queue-name authforge-events-dlq >/dev/null
awslocal sqs create-queue --queue-name authforge-events --attributes '{"VisibilityTimeout":"2","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:authforge-events-dlq\",\"maxReceiveCount\":\"3\"}"}' >/dev/null
awslocal s3 mb s3://authforge-events >/dev/null
awslocal ses verify-email-identity --email-address sender@authforge.demo >/dev/null
touch /tmp/authforge-ready
