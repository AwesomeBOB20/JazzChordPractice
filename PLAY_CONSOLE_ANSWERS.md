# Kordal — Play Console "App content" answer sheet

Copy these answers into Play Console → **Policy → App content**. Based on what Kordal actually does:
shows **AdMob ads** + offers a **RevenueCat one-time purchase**, uses the **mic on-device only**
(never transmitted), stores everything else **locally**, and has **no user accounts**.

Privacy policy URL: **https://awesomebob20.github.io/JazzChordPractice/**
Contact email: **kordalapp@gmail.com**

> ⚠️ These reflect the current build. If you later add analytics, accounts, or new SDKs, revisit
> the Data Safety form — it must always match reality.

---

## 1. Privacy policy
Paste: `https://awesomebob20.github.io/JazzChordPractice/`

## 2. Ads
- Does your app contain ads? → **Yes**

## 3. App access
- Is any functionality restricted (login/account required)? → **No** — all functionality is available
  without signing in. (Choose "All functionality is available without special access.")

## 4. Content ratings (IARC questionnaire)
- Email: **kordalapp@gmail.com**
- Category: **Utility, Productivity, Communication, or Other** (a music practice tool)
- Violence → **No**
- Sexuality / nudity → **No**
- Language (profanity) → **No**
- Controlled substances (drugs/alcohol/tobacco) → **No**
- Gambling / simulated gambling → **No**
- Does the app let users **interact / exchange content / communicate** with other users? → **No**
  (You build songs locally; there is no online sharing, chat, or multiplayer.)
- Does the app **share the user's physical location** with other users? → **No**
- Does the app allow users to **purchase digital goods**? → **Yes** (the one-time Pro upgrade)
- Is it a web browser / search engine? → **No**
- **Expected result:** Everyone / PEGI 3.

## 5. Target audience and content
- Target age groups: select **13–15, 16–17, and 18+**. **Do NOT select any under-13 group** — that
  would pull the app into Google's "Designed for Families" program and impose child-data/ad rules you
  don't want with AdMob. (Kordal is general-audience, fine for teens+.)
- Do you want the app in the Designed for Families program? → **No**
- Does your store listing/app appeal to children? → **No**

## 6. Data safety (the important one)

### Overview
- Does your app collect or share any of the required user data types? → **Yes**
  (because the AdMob SDK and the purchase flow collect data)
- Is all collected data **encrypted in transit**? → **Yes** (AdMob + RevenueCat use HTTPS)
- Do you provide a way for users to **request data deletion**? → There is **no account**, so there is no
  account data to delete; on-device data is removed on uninstall. If asked for a deletion-request
  channel, provide the email **kordalapp@gmail.com**. (No account-deletion URL is required.)

### Data types to declare
For EACH type below: **Collected = Yes**, **Shared = Yes**, **Processed ephemerally = No**,
**Collection is required (users can't turn it off) = Yes**.

| Data type (category → item) | Purpose(s) to check | Why |
|---|---|---|
| **Device or other IDs → Device or other IDs** | Advertising or marketing; Analytics | Advertising ID, used by AdMob |
| **App activity → App interactions** | Advertising or marketing; Analytics | AdMob measures app usage for ads |
| **App info & performance → Crash logs** | Analytics | AdMob/SDK diagnostics |
| **App info & performance → Diagnostics** | Analytics | SDK performance data |
| **Financial info → Purchase history** | App functionality | Unlock/restore the Pro purchase (RevenueCat) |
| **Location → Approximate location** | Advertising or marketing | AdMob may use coarse (IP-based) location to serve ads* |

\* *Location is the one judgment call. AdMob can use coarse location for ad targeting. Declaring
"Approximate location → collected & shared → Advertising" is the safe, conservative choice. If you
later configure AdMob to disable location signals, you can remove it.*

### What you do NOT declare
- **Microphone / audio** — the tuner processes audio **on-device only**; it is never recorded, stored,
  or transmitted, so under Google's definition it is **not "collected."** Do not list it.
- **Personal info (name, email), Contacts, Photos, Messages, Calendar, Health** — none collected.
- **Songs / settings / scores** — stored **locally only**, never transmitted → not "collected."

### "Shared" vs "Collected" quick guide
- The AdMob data types are **shared** (sent to Google, a third party).
- **Purchase history** is **shared** with RevenueCat + Google Play (to verify/restore the purchase).

---

## After App content is complete
You can build + upload your first AAB to the **Internal testing** track. That upload is also what
unlocks creating the **$4.99 Lifetime Pro** in-app product (chicken-and-egg), which then lets us
finish the real RevenueCat connection.
