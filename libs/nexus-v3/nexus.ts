import tl = require('azure-pipelines-task-lib/task');
import path = require('path');
import * as xml2js from 'xml2js';
import * as xpath from 'xml2js-xpath';
import { IhttpHelper } from './IhttpHelper';
import { httpHelper } from './httpHelper';
const helper: IhttpHelper = new httpHelper();

export class nexus {
  public async downloadAsset(
    nexusUrl: string,
    auth: tl.EndpointAuthorization,
    acceptUntrustedCerts: boolean,
    repository: string,
    group: string,
    artifact: string,
    version: string,
    extension: string,
    packaging: string,
    classifier?: string
  ): Promise<void> {
    // Build the final download uri
    const hostUri = new URL(nexusUrl);
    // https://help.sonatype.com/repomanager3/rest-and-integration-api/search-api
    // Build the final search uri
    let requestPath = '/service/rest/v1/search/assets/download';

    // Handle root path
    if (hostUri.pathname !== '/') {
      requestPath = path.join(hostUri.pathname, requestPath);
    }
    hostUri.pathname = requestPath;

    // Query Parameters

    // *** ONLY Works in Nexus 3.16+ ***
    // https://help.sonatype.com/repomanager3/rest-and-integration-api/search-api#SearchAPI-DownloadingtheLatestVersionofanAsset
    // We could use /service/rest/v1/status and look at the response header "server: Nexus/3.21.1-01 (OSS)"
    // hostUri.searchParams.append("sort", "version");
    // *** ONLY Works in Nexus 3.16+ ***

    hostUri.searchParams.append('repository', repository);
    hostUri.searchParams.append('maven.groupId', group);
    hostUri.searchParams.append('maven.artifactId', artifact);
    hostUri.searchParams.append('maven.extension', extension);
    hostUri.searchParams.append('maven.classifier', '');
    // Do we have a classifier
    if (classifier) {
      hostUri.searchParams.set('maven.classifier', classifier);
    }
    // switch to the "version" criteria, should work in the case of release and snapshot versions
    // hostUri.searchParams.append("maven.baseVersion", baseVersion);
    hostUri.searchParams.append('version', version);

    console.log(`Download asset using '${hostUri}'.`);
    // Execute the request
    await this.executeRequest(hostUri, auth, acceptUntrustedCerts);
    console.log(`Completed download asset using '${hostUri}'.`);
  }

  private async executeRequest(
    hostUri: URL,
    auth: tl.EndpointAuthorization,
    acceptUntrustedCerts: boolean
  ): Promise<string> {
    let responseContent: string;
    try {
      if (hostUri.protocol === 'https:') {
        if (auth.scheme === 'UsernamePassword') {
          responseContent = await helper.execute_https(
            hostUri,
            acceptUntrustedCerts,
            auth.parameters['username'],
            auth.parameters['password']
          );
        } else {
          responseContent = await helper.execute_https(
            hostUri,
            acceptUntrustedCerts
          );
        }
      } else {
        if (auth.scheme === 'UsernamePassword') {
          responseContent = await helper.execute_http(
            hostUri,
            auth.parameters['username'],
            auth.parameters['password']
          );
        } else {
          responseContent = await helper.execute_http(hostUri);
        }
      }
    } catch (inner_err) {
      console.log(`Failed to execute request '${hostUri}'.`);
      throw inner_err;
    }
    return responseContent;
  }
}
