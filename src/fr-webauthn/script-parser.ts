import { ensureArray, getIndexOne, parsePubKeyArray } from './helpers';
import { AttestationType, UserVerificationType } from './interfaces';

function parseWebAuthnRegisterText(text: string): PublicKeyCredentialCreationOptions {
  const txtEncoder = new TextEncoder();

  // e.g. `attestation: "none"`
  const attestation = getIndexOne(text.match(/attestation"{0,}:\s{0,}"(\w+)"/)) as AttestationType;
  // e.g. `timeout: 60000`
  const timeout = Number(getIndexOne(text.match(/timeout"{0,}:\s{0,}(\d+)/)));
  // e.g. from 7.0: `"userVerification":"preferred"`
  // e.g. from 6.5: `userVerification: "preferred"`
  const userVerification = getIndexOne(
    text.match(/userVerification"{0,}:\s{0,}"(\w+)"/),
  ) as UserVerificationType;
  // e.g. `"requireResidentKey":true`
  const requireResidentKey = getIndexOne(
    text.match(/requireResidentKey"{0,}:\s{0,}(\w+)/),
  ) as string;
  // e.g. `"authenticatorAttachment":"cross-platform"`
  const authenticatorAttachment = getIndexOne(
    text.match(/authenticatorAttachment"{0,}:\s{0,}"([\w-]+)/),
  ) as AuthenticatorAttachment;

  // e.g. `rp: {\n id: \"https://user.example.com:3002\",\n name: \"ForgeRock\"\n }`
  const rp = getIndexOne(text.match(/rp"{0,}:\s{0,}{([^}]+)}/)).trim();
  // e.g. `id: \"example.com\"
  const rpId = getIndexOne(rp.match(/id"{0,}:\s{0,}"([^"]*)"/));
  // e.g. `name: \"ForgeRock\"`
  const rpName = getIndexOne(rp.match(/name"{0,}:\s{0,}"([^"]*)"/));

  // e.g. `user: {\n id: Uint8Array.from(\"NTdhN...RiNjI5\",
  // function (c) { return c.charCodeAt(0) }),\n
  // name: \"57a5b4e4-...-a4f2e5d4b629\",\n
  // displayName: \"57a5b4e4-...-a4f2e5d4b629\"\n }`
  const user = getIndexOne(text.match(/user"{0,}:\s{0,}{([^]{0,})},/)).trim();
  // e.g `id: Uint8Array.from(\"NTdhN...RiNjI5\",`
  const userId = getIndexOne(user.match(/id"{0,}:\s{0,}Uint8Array.from\("([^"]+)"/));
  // e.g. `name: \"57a5b4e4-...-a4f2e5d4b629\",`
  const userName = getIndexOne(user.match(/name"{0,}:\s{0,}"([\d\w._-]+)"/));
  // e.g. `displayName: \"57a5b4e4-...-a4f2e5d4b629\"`
  const userDisplayName = getIndexOne(user.match(/displayName"{0,}:\s{0,}"([\d\w\s._-]+)"/));

  // e.g. `pubKeyCredParams: [
  // { \"type\": \"public-key\", \"alg\": -257 }, { \"type\": \"public-key\", \"alg\": -7 }
  // ]`
  const pubKeyCredParamsString = getIndexOne(
    text.match(/pubKeyCredParams"{0,}:\s{0,}\[([^]+) ]/),
  ).trim();
  // e.g. `{ \"type\": \"public-key\", \"alg\": -257 }, { \"type\": \"public-key\", \"alg\": -7 }`
  const pubKeyCredParams = parsePubKeyArray(pubKeyCredParamsString);
  if (!pubKeyCredParams) {
    throw new Error('Missing pubKeyCredParams');
  }

  // e.g. `challenge: new Int8Array([87, -95, 18, ... -3,  49, 12, 81]).buffer,`
  const challengeArr: string[] = ensureArray(
    text.match(/challenge"{0,}:\s{0,}new\s{0,}(Uint|Int)8Array\(([^\)]+)/),
  );
  // e.g. `[87, -95, 18, ... -3,  49, 12, 81]`
  const challengeJSON = JSON.parse(challengeArr[2]);
  // e.g. [87, -95, 18, ... -3,  49, 12, 81]
  const challenge = new Int8Array(challengeJSON).buffer;

  return {
    attestation,
    authenticatorSelection: {
      userVerification,
      // Only include authenticatorAttachment prop if the value is truthy
      ...(authenticatorAttachment && { authenticatorAttachment }),
      // Only include requireResidentKey prop if the value is of string "true"
      ...(requireResidentKey === 'true' && { requireResidentKey: !!requireResidentKey }),
    },
    challenge,
    pubKeyCredParams,
    rp: {
      name: rpName,
      // only add key-value pair if truthy value is provided
      ...(rpId && { id: rpId }),
    },
    timeout,
    user: {
      displayName: userDisplayName,
      id: txtEncoder.encode(userId),
      name: userName,
    },
  };
}

function parseWebAuthnAuthenticateText(text: string): PublicKeyCredentialRequestOptions {
  let allowCredentials;
  // e.g. `allowCredentials: [
  // { \"type\": \"public-key\",
  // \"id\": new Int8Array([-107, 93, 68, -67, ... -19, 7, 4]).buffer }
  // ]`
  const allowCredentialsText = getIndexOne(
    text.match(/allowCredentials"{0,}:\s{0,}\[([^]+)\s{0,}]/),
  ).trim();
  // e.g. `"userVerification":"preferred"`
  const userVerification = getIndexOne(
    text.match(/userVerification"{0,}:\s{0,}"(\w+)"/),
  ) as UserVerificationType;

  if (allowCredentialsText) {
    // Splitting objects in array in case the user has multiple keys
    const allowCredentialArr = allowCredentialsText.split('},') || [allowCredentialsText];
    // Iterating over array of substrings
    allowCredentials = allowCredentialArr.map((str) => {
      // e.g. `{ \"type\": \"public-key\",
      const type = getIndexOne(str.match(/type"{0,}:\s{0,}"([\w-]+)"/)) as 'public-key';
      // e.g. \"id\": new Int8Array([-107, 93, 68, -67, ... -19, 7, 4]).buffer
      const idArr = ensureArray(str.match(/id"{0,}:\s{0,}new\s{0,}(Uint|Int)8Array\(([^\)]+)/));
      // e.g. `[-107, 93, 68, -67, ... -19, 7, 4]`
      const idJSON = JSON.parse(idArr[2]);
      // e.g. [-107, 93, 68, -67, ... -19, 7, 4]
      const id = new Int8Array(idJSON).buffer;

      return {
        type,
        id,
      };
    });
  }

  // e.g. `timeout: 60000`
  const timeout = Number(getIndexOne(text.match(/timeout"{0,}:\s{0,}(\d+)/)));

  // e.g. `challenge: new Int8Array([87, -95, 18, ... -3,  49, 12, 81]).buffer,`
  const challengeArr: string[] = ensureArray(
    text.match(/challenge"{0,}:\s{0,}new\s{0,}(Uint|Int)8Array\(([^\)]+)/),
  );
  // e.g. `[87, -95, 18, ... -3,  49, 12, 81]`
  const challengeJSON = JSON.parse(challengeArr[2]);
  // e.g. [87, -95, 18, ... -3,  49, 12, 81]
  const challenge = new Int8Array(challengeJSON).buffer;
  // e.g. `rpId: \"example.com\"`
  const rpId = getIndexOne(text.match(/rpId"{0,}:\s{0,}\\{0,}"([^"\\]*)/));

  return {
    challenge,
    timeout,
    // only add key-value pairs if the truthy values are provided
    ...(allowCredentials && { allowCredentials }),
    ...(userVerification && { userVerification }),
    ...(rpId && { rpId }),
  };
}

export { parseWebAuthnAuthenticateText, parseWebAuthnRegisterText };
