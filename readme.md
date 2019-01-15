# Unity Cloud Build To App Center

A NodeJS application to automate binary deployments from Unity Cloud Build to App Center.

![Slack Screenshot](screenshot.jpg?raw=true "Screenshot of Unity Cloud Build and App Center activity within Slack when using this application.")

Note; This is an initial release which is functional, but needs refactoring.

## App Flow

  1. Receive a webhook from Unity Cloud Build to notify a build is ready.
  2. Get the build details from the JSON payload within the webhook.
  3. Download the app binary from the Unity Cloud Build API.
  4. Upload the app binary to App Center.

## Requirements

- Setup a [Unity Cloud Build](https://unity3d.com/services/cloud-build) account and project.
- Setup a [App Center](https://App Center.net/) account. App Center will use the app package name to detemine which project to upload to.

## Installation

  1. Clone this repository.

  2. Add API keys to '.env' for both Unity Cloud Build and App Center.
    * UCB API key can be obtained [here](https://build.cloud.unity3d.com/preferences/).
    * App Center API key can be created [here](https://rink.App Center.net/manage/auth_tokens). Be sure to create a key 'Upload' rights (e.g. anything above 'Read Only').

  3. Deploy.  
    * Have only tested running on [Heroku](https://www.heroku.com/).
  4. Setup the Unity Cloud Build webhook.
    * Within UCB, view your app. Click 'Notifications', then 'Add New' and enter your app URL with '/build' appended. E.g. 'http://[appurl]/build/'
    * Use a tool like [Request Bin](https://requestb.in/) to test web hooks from UCB, ontain the payload and test requests to '/build/'.

## Notes

- If you use Slack, integrate UCB and App Center to be notified when a new build is ready and has been pused to App Center. See screenshot above.
- You don't need to setup the app on App Center, if you upload the binary it will automatically create a new app instance.
- Configure App Center to automatically notify users after the binary has uploaded. See the 'notify' variable within the 'uploadToApp Center()' function. [App Center API](https://support.App Center.net/kb/api/api-versions#upload-version)

## Todo
  - Clean up and comment codebase.
  - Populate App Center release notes with Git commit message.
  - Add logging feature to show builds processed and deployed.
  - Integrate job system to manage/prioritise jobs and view jobs in progress.

## Licenses

Copyright 2016 Nathan Brodbent

This software is licensed under [Apache License 2.0](http://choosealicense.com/licenses/apache-2.0/).
