// class-validator and class-transformer decorators read type metadata at
// runtime. In the app @nestjs/core loads it; in tests that only touch DTOs it
// has to be imported by hand.
import 'reflect-metadata';
