export interface IhttpHelper {
    execute_http(searchUri : URL) : Promise<void>;
    execute_http(searchUri : URL, username? : string, password? : string) : Promise<void>;
    execute_https(searchUri : URL, acceptUntrustedCerts : boolean)  : Promise<void>;
    execute_https(searchUri : URL, acceptUntrustedCerts : boolean, username? : string, password? : string)  : Promise<void>
};