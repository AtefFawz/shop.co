const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const UserSchema = require("../modules/userSchema");
const { USER } = require("../utils/role");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await UserSchema.findOne({ googleId: profile.id });
        if (user) return done(null, user);

        user = await UserSchema.findOne({ email: profile.emails[0].value });
        if (user) {
          user.googleId = profile.id;
          if (!user.avatar && profile.photos && profile.photos[0]) {
            user.avatar = profile.photos[0].value;
          }
          await user.save();
          return done(null, user);
        }

        user = await UserSchema.create({
          fullName: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
          avatar:
            profile.photos && profile.photos[0]
              ? profile.photos[0].value
              : undefined,
          role: USER,
        });

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    },
  ),
);
