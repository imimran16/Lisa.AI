LISA AI — WEBSITE FILES FOR VERCEL

IMPORTANT: Upload the CONTENTS of this ZIP to the ROOT of the GitHub repository
connected to your Vercel Lisa AI project. Do not upload the ZIP itself.

The correct Digital Asset Links file is included at:
  .well-known/assetlinks.json

After upload and Vercel deployment, open:
  https://lisaai-bay.vercel.app/.well-known/assetlinks.json

It must display JSON containing package_name "com.lisaai.app".
If it displays 404 or old package details, the wrong folder/repository was deployed.

Then install the Lisa AI.apk from the PWABuilder package and test the app.
Do not upload signing.keystore or signing-key-info.txt to GitHub or the website.
Keep the signing keystore private for future app updates.

If the app was installed from Google Play with Play App Signing enabled, its
Play signing certificate fingerprint may differ. In that case, add the Play
App Signing SHA-256 fingerprint from Play Console to assetlinks.json too.
