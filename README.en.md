# dsh-plugin-mock-server — Mock Server

Levanta un servidor HTTP local de mocks (rutas y respuestas configurables) para probar integraciones, con start/stop y confirmacion.

## Tools

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `start` | Iniciar mock |
| `stop` | Detener mock |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-mock-server` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-mock-server
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_MOCK_SERVER_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\mock-server\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
