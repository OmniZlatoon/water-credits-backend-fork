Closes #35

## Summary

- add `@DeleteDateColumn() deletedAt` and `@Column() isActive` to `src/modules/projects/entities/project.entity.ts` so TypeORM automatically excludes soft-deleted rows from all standard `find*` queries.
- inject `Retirement` repository into `ProjectsService` and add a pre-delete guard in `remove()` that throws `409 ConflictException` if any retirement with a non-null `txHash` references the project.
- convert `remove()` from `repo.remove()` (hard delete) to `repo.softRemove()` (soft delete) — sets `isActive = false` and stamps `deletedAt`, preserving all child records.
- add an admin-only `force=true` path inside `remove()` that falls through to `repo.remove()` for permanent deletion of truly dead projects with no financial records.
- expose a `?force=true` query parameter on `DELETE /projects/:id` via `ParseBoolPipe` + `DefaultValuePipe(false)`, passed through to the service.
- register `Retirement` in `ProjectsModule` via `TypeOrmModule.forFeature` so the service can inject its repository without a circular dependency.
- create `src/migrations/019_project_soft_deletes.sql` to add `deleted_at TIMESTAMPTZ` and `is_active BOOLEAN` columns to `projects`, and to drop and recreate all child-table foreign keys (`retirements`, `sensor_readings`, `reading_batches`, `oracle_submissions`) from `ON DELETE CASCADE` to `ON DELETE RESTRICT`.

## Testing

- updated `projects.service.spec.ts`: replaced old hard-delete assertions with soft-delete assertions (`softRemove` called, `remove` not called), added `ConflictException` test for a project with confirmed retirements, and added a force hard-delete test for admins.
- updated `projects.controller.spec.ts`: added `deletedAt` and `isActive` to the mock project fixture, and updated the `remove` test to pass the new `force` argument.
- confirmed no new TypeScript errors introduced in the projects module via `tsc --noEmit`.
- `npm run build`
