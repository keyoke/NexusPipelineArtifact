# Sonatype Nexus Repository artifact for Release Pipelines
This extension provides support for Nexus Maven Repositories when leveraging Release Pipelines, the initial version includes Release Pipeline Artifact support for Nexus Maven Repositories as well as providing Azure Pipelines tasks for downloading assets from Maven Repositories.

## Usage
This extension requires you to first configure a service connection to connect to your Nexus Repository server. Once connected, you can link a source artifact from the a Nexus Maven Repository and use these artifacts in your Release Pipeline.

### Connecting to Nexus Repository
Go to project settings -> Services Connections tab and create a New Service Connection of type Sonatype Nexus Repository.

![Creating a Sonatype Nexus Repository connection](images/screen5.png)

The authentication scenarios which are currently supported by the extension are :
* Username & Password
* Anonymous

If your Nexus Repository server is deployed in a private cloud which is behind a firewall and the Azure DevOps Service does not have line of sight to the server - the Artifact fields will not be dynamically populated at design time and you will have to manually provide these values.

### Linking a Nexus Maven Repository artifact
Once you have set up the service connection, you will be able to link to a Nexus Maven Repository artifact in your release definition.

![Linking Nexus Maven Repository artifact](images/screen1.png)

Once you have selected the Service Connection, you will be able to select the relevant repository from the pre-populated repository drop-down. You will also be asked to select the repository, and specify the Nexus components details.

![Linking Nexus Maven Repository artifact](images/screen3.png)


### Output Variables
The tasks proviuded by this extension make use of output variables to provide the downloaded assets file name to subsequent tasks executing in the same pipeline.

The following output variables are set:

* MAVEN_REPOSITORY_ASSET_FILENAME - The final file name of the Asset which was downloaded from your Maven Repository.






