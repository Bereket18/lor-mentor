import { Injectable } from '@nestjs/common';

// AppService is kept minimal
// Feature logic lives in feature modules
// Example: AuthModule, CoursesModule, etc.
@Injectable()
export class AppService {
  getHello(): string {
    return 'Lor Mentor API is up and running!';
  }
}
