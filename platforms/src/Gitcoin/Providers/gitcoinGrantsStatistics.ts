// ----- Types
import type { ProviderContext, RequestPayload, VerifiedPayload } from "@gitcoin/passport-types";
import type { Provider, ProviderOptions } from "../../types";
import { getErrorString } from "../../utils/errors";
import axios from "axios";
import { GithubFindMyUserResponse, verifyGithub } from "../../Github/Providers/github";

const AMI_API_TOKEN = process.env.AMI_API_TOKEN;

export type GitcoinGrantStatistics = {
  errors?: string[] | undefined;
  record?: { [k: string]: number };
};

export type GitcoinGrantProviderOptions = {
  threshold: number;
  receivingAttribute: string;
  recordAttribute: string;
};

// Export a Gitcoin Provider. This is intended to be a generic implementation that should be extended
export class GitcoinGrantStatisticsProvider implements Provider {
  // The type will be determined dynamically, from the options passed in to the constructor
  type = "";

  // The URL from where to pull the data from
  dataUrl = "";

  // Options can be set here and/or via the constructor
  _options: GitcoinGrantProviderOptions = {
    threshold: 1,
    receivingAttribute: "",
    recordAttribute: "",
  };

  // construct the provider instance with supplied options
  constructor(providerTypePrefix: string, options: ProviderOptions = {}) {
    this._options = { ...this._options, ...options };
    this.type = `${providerTypePrefix}#${this._options.recordAttribute}#${this._options.threshold}`;
  }

  // verify that the proof object contains valid === "true"
  async verify(payload: RequestPayload, context: ProviderContext): Promise<VerifiedPayload> {
    let valid: boolean = false;
    let githubUser: GithubFindMyUserResponse = context.githubUser as GithubFindMyUserResponse;
    try {
      if (!githubUser) {
        githubUser = await verifyGithub(payload.proofs.code, context);
        context["githubUser"] = githubUser;
      }
      console.log("gitcoin - githubUser", githubUser);

      // Only check the contribution condition if a valid github id has been received
      valid = !githubUser.errors && !!githubUser.id;
      if (valid) {
        const gitcoinGrantsStatistic = await getGitcoinStatistics(this.dataUrl, githubUser.login);
        console.log("gitcoin - getGitcoinStatistics", gitcoinGrantsStatistic);

        valid =
          !gitcoinGrantsStatistic.errors &&
          (gitcoinGrantsStatistic.record
            ? gitcoinGrantsStatistic.record[this._options.receivingAttribute] >= this._options.threshold
            : false);

        return {
          valid: valid,
          error: gitcoinGrantsStatistic.errors,
          record: valid
            ? {
                id: `${githubUser.id}`,
                [this._options.recordAttribute]: `${this._options.threshold}`,
              }
            : undefined,
        };
      }
    } catch (e) {
      return { valid: false };
    }

    const ret = {
      valid: valid,
      error: githubUser ? githubUser.errors : undefined,
      record: valid
        ? {
            id: `${githubUser.id}`,
            [this._options.recordAttribute]: `${this._options.threshold}`,
          }
        : undefined,
    };

    return ret;
  }
}

const getGitcoinStatistics = async (dataUrl: string, handle: string): Promise<GitcoinGrantStatistics> => {
  try {
    const grantStatisticsRequest = await axios.get(`${dataUrl}?handle=${handle}`, {
      headers: { Authorization: `token ${AMI_API_TOKEN}` },
    });

    console.log("gitcoin - API response", handle, dataUrl, grantStatisticsRequest.data);
    return { record: grantStatisticsRequest.data } as GitcoinGrantStatistics;
  } catch (error) {
    console.log("gitcoinGrantsStatistics", dataUrl, handle, getErrorString(error));
    return {
      errors: [
        "Error getting user info",
        `${error?.message}`,
        `Status ${error.response?.status}: ${error.response?.statusText}`,
        `Details: ${JSON.stringify(error?.response?.data)}`,
      ],
    };
  }
};
