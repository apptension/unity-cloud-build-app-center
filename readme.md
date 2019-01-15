# Unity Cloud Build To App Center

A NodeJS application to automate binary deployments from Unity Cloud Build to App Center.

## App Flow

  1. Receive a webhook from Unity Cloud Build to notify a build is ready.
  2. Get the build details from the JSON payload within the webhook.
  3. Download the app binary from the Unity Cloud Build API.
  4. Upload the app binary to App Center.

## Requirements

- Setup a [Unity Cloud Build](https://unity3d.com/services/cloud-build) account and project.
- Setup a [App Center](https://appcenter.ms) account.

## Env variables

## URL configuration

## Installation

  1. Pull the Docker image

  2. Create API keys for both Unity Cloud Build and App Center.
    * UCB API key can be obtained [here](https://build.cloud.unity3d.com/preferences/).
    * App Center API key can be created [here](https://rink.App Center.net/manage/auth_tokens).
  3. Deploy.  
  4. Setup the Unity Cloud Build webhook.
    * Within UCB, view your app. Click 'Notifications', then 'Add New' and enter your app URL with '/build' appended. E.g. 'http://[appurl]/build/'
    * Use a tool like [Request Bin](https://requestb.in/) to test web hooks from UCB, contain the payload and test requests to '/build/'.

## Notes

- If you use Slack, integrate UCB and App Center to be notified when a new build is ready and has been pushed to App Center.
- Configure App Center to automatically notify users after the binary has uploaded.

## Todo
  - Integrate job system to manage/prioritise jobs and view jobs in progress.

## Licenses

Copyright 2016 Nathan Brodbent

This software is licensed under [Apache License 2.0](http://choosealicense.com/licenses/apache-2.0/).
