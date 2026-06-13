import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Override handleRequest to give a clearer error message
  // By default Passport gives a generic error
  handleRequest(err: any, user: any, info: any) {
    // If there is an error or no user was found
    if (err || !user) {
      throw new UnauthorizedException(
        'You must be logged in to access this resource',
      );
    }
    return user;
  }
}
