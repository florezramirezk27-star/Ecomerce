import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions, Profile } from 'passport-facebook';

type DoneFn = (error: any, user?: any) => void;

@Injectable()
export class FacebookStrategy extends PassportStrategy(
  Strategy,
  'facebook',
) {
  constructor() {
    super({
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL,
      scope: ['email'],
      profileFields: ['id', 'displayName', 'emails', 'photos'],
    } as StrategyOptions);
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: DoneFn,
  ) {
    const email = profile.emails?.[0]?.value ?? null;
    const photo = profile.photos?.[0]?.value ?? null;

    const user = {
      email,
      name:
        profile.displayName ||
        email?.split('@')[0] ||
        'Usuario de Facebook',
      facebookId: profile.id,
      picture: photo,
    };
    done(null, user);
  }
}