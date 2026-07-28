# ADR-010: Acceso sin contraseña por enlace de un solo uso; sesiones en cookie httpOnly
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24

## Contexto

El sistema concentra información personal sensible sobre rutinas y vida privada, y su premisa
de producto es la minimización de datos. Las fuerzas relevantes:

- Equipo pequeño: cada mecanismo de autenticación que se construye hay que mantenerlo y
  parchearlo.
- Almacenar contraseñas implica hashing, política de rotación, recuperación, y ser
  responsable de un secreto reutilizable del usuario.
- Los feeds `.ics` no pueden autenticarse con cookies: los clientes de calendario no las
  manejan.
- Q1 se resolvió el 2026-07-27: **SaaS multiusuario**. Este ADR queda firme; si hubiera sido
  monousuario, gran parte de esto habría sobrado.

## Decisión

**Acceso sin contraseña mediante enlace de un solo uso enviado por email, con sesión en cookie
`httpOnly`.**

- `POST /auth/request-link` → siempre `202`, exista o no la cuenta (no filtra quién tiene
  cuenta). Rate limit por IP y por dirección.
- Token de un solo uso, ≥128 bits, caducidad de 15 minutos, almacenado **hasheado**, invalidado
  al consumirse.
- Sesión: cookie `httpOnly`, `Secure`, `SameSite=Lax`, con el identificador de sesión
  persistido en base de datos para poder **revocarla en el servidor**. Sin JWT autocontenido.
- Caducidad deslizante de 30 días.
- Los **feeds `.ics` son la única excepción**: token opaco en la URL, revocable, con acceso
  únicamente a los bloques del plan ([ADR-008]).

## Alternativas consideradas

**Email + contraseña.**
A favor: universal, sin dependencia de proveedor de correo para entrar, funciona sin conexión
al buzón. En contra: obliga a custodiar un secreto reutilizable del usuario, con hashing,
recuperación, política y el riesgo de reutilización de contraseñas — todo para un producto
cuyo diferencial es no acumular datos innecesarios. Se descarta; es más superficie de la que
aporta.

**OAuth con Google como identidad principal.**
A favor: sin gestión de credenciales, y **se necesitará Google OAuth de todas formas** cuando
llegue la lectura de calendarios, lo que lo convierte en el argumento más fuerte a favor. En
contra: un producto que se presenta como cuidadoso con la privacidad y exige una cuenta de
Google para entrar es contradictorio de cara al usuario; y crea dependencia de un tercero para
el acceso básico. Se descarta **como identidad**, y se mantiene para lo que sí le corresponde:
autorizar el acceso al calendario en la fase 2 de [ADR-008], desacoplado del inicio de sesión.

**Proveedor gestionado (Auth0, Clerk, Supabase Auth).**
A favor: menos código, funcionalidades listas. En contra: coste recurrente, un tercero más con
los datos de identidad, y acoplamiento notable para un producto con un modelo de autenticación
que cabe en unas pocas decenas de líneas. Se descarta por desproporción; sería razonable si
apareciera un requisito de SSO empresarial.

**JWT autocontenido sin estado.**
A favor: sin consulta a base de datos por petición. En contra: **no se puede revocar** sin
añadir una lista de revocación, que es exactamente el estado que se pretendía evitar. Para el
volumen previsto, consultar la sesión es irrelevante. Se descarta.

**Sin autenticación (aplicación local o monousuario).**
Habría sido lo correcto si Q1 se hubiera respondido con "es para mí". **Descartada el
2026-07-27**: Q1 se resolvió como SaaS multiusuario.

## Consecuencias

**Lo que ganamos**
- **No custodiamos contraseñas.** El compromiso de la base de datos no expone credenciales
  reutilizables en otros servicios.
- Sesiones revocables desde el servidor: cerrar sesión en todos los dispositivos es una
  operación real.
- Poco código propio, poca superficie que mantener.
- Ninguna dependencia de un proveedor de identidad externo.

**Lo que cuesta**
- **Dependencia de la entrega de correo para entrar.** Si el email tarda o cae en spam, el
  usuario no puede acceder. Es el punto débil de este enfoque y exige un proveedor
  transaccional serio (Resend, Postmark) con dominio verificado, SPF, DKIM y DMARC.
- Iniciar sesión es más lento: hay que ir al buzón. Mitigado con sesiones de 30 días
  deslizantes, de modo que sea infrecuente.
- Un buzón comprometido implica la cuenta comprometida. Es igualmente cierto con
  contraseñas más recuperación por email, así que no es un empeoramiento real.
- Los tokens de feed `.ics` son una vía de acceso paralela y más débil por naturaleza. Se
  compensa con entropía alta, revocabilidad y **contenido mínimo en el feed**.

**Lo que queda condicionado**
- Toda autorización es por `user_id` en el repositorio, con un test de aislamiento por
  endpoint (fase 6).
- El borrado de cuenta debe revocar los feeds en la misma transacción ([02 §10](../02-modelo-de-datos.md)).
- Con Q1 resuelta como SaaS multiusuario, el test de aislamiento por endpoint deja de ser una
  precaución y pasa a ser el control de privacidad más importante del sistema: es lo único que
  impide que los datos de un usuario aparezcan en la sesión de otro.

[ADR-008]: ./ADR-008-sincronizacion-calendarios.md
