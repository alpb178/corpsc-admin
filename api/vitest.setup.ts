// Los decoradores de class-validator y class-transformer leen metadatos de
// tipo en tiempo de ejecución. En la app la carga @nestjs/core; en los tests
// que solo tocan DTO hay que importarla a mano.
import 'reflect-metadata';
