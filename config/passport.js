import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import authSchema from "../models/authSchema.js";
import { USER } from "../utils/role.js";

const googleConfig = {
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
};

if (googleConfig.clientID && googleConfig.clientSecret && googleConfig.callbackURL) {
  passport.use(
    new GoogleStrategy(googleConfig, async (accessToken, refreshToken, profile, done) => {
      try {
        const emailEntry = profile.emails?.[0];
        const emailIsVerified = profile._json?.email_verified === true || profile.emails?.some((entry) => entry.verified === true);
        const email = emailIsVerified ? emailEntry?.value?.trim().toLowerCase() : "";
        if (!email) return done(null, false, { message: "Google account has no verified email" });

        let user = await authSchema.findOne({ googleId: profile.id });
        if (user) return done(null, user);

        user = await authSchema.findOne({ email });
        if (user) {
          // The email is verified by Google. If the existing account was never
          // verified (password set by whoever registered first), drop that password
          // so a squatter cannot keep access to the real owner's account.
          if (user.emailVerified === false) {
            await authSchema.updateOne({ _id: user._id }, { $unset: { password: 1 } });
          }
          user.emailVerified = true;
          user.emailVerificationHash = null;
          user.emailVerificationExpires = null;
          user.googleId = profile.id;
          if (!user.avatar && profile.photos?.[0]?.value) {
            user.avatar = profile.photos[0].value;
          }
          await user.save();
          return done(null, user);
        }

        user = await authSchema.create({
          fullName: profile.displayName || email.split("@")[0],
          email,
          googleId: profile.id,
          avatar: profile.photos?.[0]?.value,
          role: USER,
        });

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );
} else {
  console.warn("Google OAuth is disabled: configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL.");
}

export default passport;
