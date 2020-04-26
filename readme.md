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

  - `UNITYCLOUD_KEY` - Unity Cloud Build API key
  - `UNITYCLOUD_SECRET` - shared secret used by Unity Cloud Build to sign the request when sending webhook.
  This signature need to be valid, otherwise the request will be ignored
  If this variable is not provided, signature check will be disabled (ie. all requests will be accepted).
  - `APPCENTER_KEY` - App Center API key

## URL configuration

When setting up the webhook in Unity Cloud Build, you can provide all the
required configuration in the URL query string.

  - `ownerName` - name of the owner of the App Center application
  - `appName` - name of the App Center application
  - `team` - name of the team to distribute the app to on App Center
  - `excludeTargets` - comma-separated list of Unity Cloud Build targets that
  shouldn't be deployed to App Center

## Installation

  1. Pull the Docker image.
  2. Create API keys for both Unity Cloud Build and App Center.
     * UCB API key can be obtained [here](https://build.cloud.unity3d.com/preferences/).
     * App Center API key can be created [here](https://appcenter.ms/settings/apitokens).
  3. Deploy the Docker image.  
  4. Setup the Unity Cloud Build webhook.
     * Within UCB, view your app. Click 'Notifications', then 'Add New' and enter your app URL with '/build' appended. E.g. 'https://[appurl]/build/'

## Troubleshooting

Use a tool like [ngrok](https://ngrok.com/) to test web hooks from Unity Cloud
Build and verify their payload.

## Notes

- If you use Slack, integrate UCB and App Center to be notified when a new build
  is ready and has been pushed to App Center.
- Configure App Center to automatically notify users after the binary is uploaded.

## Todo
  - Integrate job system to manage/prioritise jobs and view jobs in progress.

## Licenses

Copyright 2016 Nathan Brodbent

This software is licensed under [Apache License 2.0](http://choosealicense.com/licenses/apache-2.0/).
