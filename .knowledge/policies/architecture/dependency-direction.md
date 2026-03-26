# Policy: Dependency Direction

<!-- CUSTOMIZE: Define your project's layer architecture -->

## Scope
src/

## Rules
<!-- CUSTOMIZE: Replace with your project's dependency rules -->
- ALLOW: higher layers → lower layers
- DENY: lower layers → higher layers
- DENY: circular imports (A → B → A)

## Exceptions
- Type-only imports are allowed across any boundary
- Barrel index files may re-export from any layer

## Anti-patterns
- Service importing a UI component
- Database layer importing a controller
- Circular dependencies between modules

## Enforcement
<!-- CUSTOMIZE: Create a structural test that greps for forbidden imports -->
`__tests__/structure/dependency-direction.test.ts`
