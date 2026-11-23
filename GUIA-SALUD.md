# Salud del iPhone en JPR Coach (v13)

Cada cliente da su permiso en la app y comparte con un atajo de su iPhone los datos de Salud que elija. Tú los ves en la pestaña **Salud** de su ficha. Se actualiza sola cuando llegan datos nuevos.

Qué se recoge: pasos, sueño, pulsaciones en reposo (FC), variabilidad cardiaca (VFC), calorías activas y peso. El cliente elige cuáles comparte. Lo que no marca no se guarda, aunque el atajo lo envíe.

Cada cuánto llegan datos: cuando se ejecuta el atajo, que es al apagar la alarma y al poner el móvil a cargar. No es al minuto: Apple no deja que una app web lea Salud en segundo plano.

---

## 1. Base de datos (2 min)
Supabase > SQL Editor > New query > pega `2-Supabase/fase6.sql` > **Run**.

## 2. La función que recibe los datos (3 min)
Supabase > Edge Functions > **Deploy a new function** > **Via Editor**
- Nombre exacto: `health-ingest`
- Borra el código de ejemplo, pega todo `2-Supabase/health-ingest.ts` > **Deploy**
- En los detalles de la función, **desactiva "Verify JWT"** (igual que con las de Stripe). La función comprueba el código de cada cliente por su cuenta.

No hace falta añadir secretos: la función usa los que Supabase ya trae de serie.

## 3. Subir la app (2 min)
GitHub > https://github.com/n2wh4yyffb-dot/jpr-coach/upload/main > arrastra los 3 archivos de `1-GitHub` (app.js, index.html, sw.js) > **Commit changes**. La versión nueva es `jpr-v13`.

## 4. Crear el atajo una vez, en tu iPhone (20 min)
Este atajo lo montas tú una sola vez y luego lo compartes con un enlace. Yo no puedo darte el archivo hecho, porque Apple solo acepta atajos firmados desde un iPhone o un Mac.

App **Atajos** > pestaña Atajos > **+**. Arriba, toca el nombre y ponle **JPR Salud**.

Añade estas acciones en este orden (búscalas por su nombre en la barra de abajo):

**El código del cliente**
1. **Texto**: déjalo vacío.

**Pasos**
2. **Buscar muestras de salud**: Tipo = *Pasos*; filtro *Fecha de inicio* = *hoy*; **Agrupar por: Día**.
3. **Obtener detalles de muestras de salud**: *Valor*.
4. **Establecer variable**: nombre `Pasos`.

**Sueño**
5. **Buscar muestras de salud**: Tipo = *Análisis del sueño*. Filtros (con "Todas" las condiciones): *Fecha de finalización* está en los últimos *1 día*; *Valor* no es *En cama*; *Valor* no es *Despierto*.
6. **Obtener detalles de muestras de salud**: *Duración*.
7. **Establecer variable**: `Sueno`.

**FC en reposo**
8. **Buscar muestras de salud**: Tipo = *Frecuencia cardiaca en reposo*; *Fecha de inicio* está en los últimos *2 días*; Ordenar por *Fecha de inicio*, *Más reciente primero*; **Límite: 1**.
9. **Obtener detalles de muestras de salud**: *Valor*.
10. **Establecer variable**: `FC`.

**VFC**
11. **Buscar muestras de salud**: Tipo = *Variabilidad de la frecuencia cardiaca*; *Fecha de inicio* está en los últimos *1 día*; *Más reciente primero*; **Límite: 1**.
12. **Obtener detalles de muestras de salud**: *Valor*.
13. **Establecer variable**: `VFC`.

**Calorías activas**
14. **Buscar muestras de salud**: Tipo = *Energía activa*; *Fecha de inicio* = *hoy*; **Agrupar por: Día**.
15. **Obtener detalles de muestras de salud**: *Valor*.
16. **Establecer variable**: `Calorias`.

**Peso** (solo si se ha pesado hoy)
17. **Buscar muestras de salud**: Tipo = *Peso*; *Fecha de inicio* = *hoy*; *Más reciente primero*; **Límite: 1**.
18. **Obtener detalles de muestras de salud**: *Valor*.
19. **Establecer variable**: `Peso`.

**Envío**
20. **Obtener contenido de URL**
   - URL: `https://dsiptnnbesvlvfckubiu.supabase.co/functions/v1/health-ingest`
   - Toca la flecha para ver más: Método **POST**, Cuerpo de la solicitud **JSON**
   - Añade 7 campos de tipo **Texto**. A la izquierda va el nombre exacto y a la derecha la variable:

| Nombre | Valor |
|---|---|
| `codigo` | Texto (el de la acción 1) |
| `pasos` | Pasos |
| `sueno` | Sueno |
| `fc_reposo` | FC |
| `vfc` | VFC |
| `calorias` | Calorias |
| `peso` | Peso |

**La pregunta al instalar.** Abajo, toca la **ⓘ** > **Configuración** > **Preguntas de importación** > **Añadir pregunta**. Elige el campo de la acción 1 (Texto) y escribe la pregunta: `Pega tu código de JPR Coach (Perfil › Salud del iPhone)`. Así cada cliente pega su código al instalarlo.

## 5. Probar con la cuenta Prueba (5 min)
1. En la app, entra con la cuenta **Prueba** > Perfil > **Salud del iPhone** > marca los datos > acepta > copia el código.
2. Pega ese código en la acción 1 del atajo y ejecútalo. Toca **Permitir** en todos los permisos de Salud que te pida.
3. Entra con tu cuenta de coach > ficha de Prueba > **Salud**. Tiene que salir "Recibiendo datos" con tus números de hoy.
4. Si algún número no cuadra (por ejemplo, el sueño), abre abajo "Último envío recibido (para revisar el atajo)" y pásame lo que sale. Ajusto la función para ese formato.
5. Cuando funcione, **vacía otra vez la acción 1** (borra el código de Prueba) antes de compartir. Si no, todos los clientes enviarían sus datos a la ficha de Prueba.

## 6. Compartir el atajo
En Atajos, mantén pulsado JPR Salud > **Compartir** > **Copiar enlace de iCloud**. En la app JPR Coach (coach) > **Perfil** > **Salud del iPhone** > pega el enlace > **Guardar**.

## 7. Pedirlo a los clientes
En la ficha de un cliente sin conectar, la pestaña Salud tiene el botón **Pedírselo por mensaje**, que deja el mensaje ya escrito en el chat. El cliente va a Perfil > Salud del iPhone, elige qué comparte, acepta, copia su código e instala el atajo. Las automatizaciones (alarma y cargador) se le explican en la misma pantalla.

---

## Cómo funciona por dentro
- **Permiso**: solo el propio cliente puede activar la conexión (Supabase lo bloquea para cualquier otro, también para el coach). Se guardan la fecha y la versión del texto aceptado.
- **Código**: cada cliente tiene uno propio y aleatorio. Al desconectar, el código deja de funcionar y el cliente elige si se borra lo ya enviado.
- **Datos**: un registro por cliente y día (tabla `health_daily`). Cada envío actualiza el día de hoy (hora de Madrid). Lo puede escribir solo la función, nunca la app.
- **Tiempo real**: la ficha del coach se actualiza en cuanto llega un envío. En la lista de clientes salen los pasos de hoy.
- **Avisos** en la ficha: sueño medio de la semana por debajo de 6 h 30; pulsaciones en reposo 5 o más por encima de su media; VFC un 15 % o más por debajo de su media; menos de 5.000 pasos de media.
- **Privacidad**: la política de privacidad incluye ya un párrafo sobre Salud del iPhone. Queda pendiente, junto con el resto, la revisión legal.

## Limitaciones
- **Solo iPhone.** Android no tiene la app Atajos.
- El iPhone solo deja leer Salud con el móvil desbloqueado. Por eso el atajo salta al apagar la alarma y al conectar el cargador, momentos en los que el móvil suele estar en la mano.
- Si el cliente usa varias apps que apuntan el sueño (Apple Watch y otra), el sueño puede salir más largo de lo real.
