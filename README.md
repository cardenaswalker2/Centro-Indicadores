# 📊 Centro de Indicadores & Gestión de Desempeño

Una plataforma web profesional, moderna y ligera diseñada para la monitorización de **KPIs operativos, control de metas, análisis de tendencias y gestión de planes de acción** para plantas de producción, logística y áreas corporativas.

---

## 🌟 Características Principales

### 1. 📈 Tablero General Ejecutivo (Dashboard)
- Vista panorámica con estado consolidado del cumplimiento por área (Producción, Logística, Gestión Humana, etc.).
- Tarjetas interactivas de KPIs con semáforo configurable (*Cumple*, *En riesgo*, *No cumple* o *Sin dato*).
- Barras de estado ponderadas por plantas y unidades operativas.

### 2. 🔍 Diagnóstico Analítico y Tendencias
- Filtro multidimensional por Área, Planta/Sede, Indicador y selección múltiple de periodos o trimestres (T1, T2, Semestres).
- Gráficos vectoriales SVG dinámicos sin librerías pesadas, con proyección lineal (*Tendencia mejorando, estable o deteriorando*).
- Comparativa histórica multianual (ej: 2026 vs 2025 vs 2024).

### 3. 🛠️ Bitácora de Causas y Planes de Acción
- Registro directo en tabla con **autoguardado** inmediato.
- Gestión de ciclo de vida de contramedidas (*Abierto*, *En curso*, *Cerrado*, *Vencido*).
- Matriz de calor y ranking de causas raíz recurrentes.

### 4. ✍️ Hoja de Captura Mensual Ágil
- Entrada rápida con teclado (navegación con `Enter` entre métricas).
- Función "Repetir mes previo" para agilizar el diligenciamiento.
- Asociación directa de planes de acción para métricas fuera de meta.

### 5. 🎯 Planificación de Metas
- Metas anuales con desglose y prorrateo automático mes a mes.
- Soporte para estacionalidad y particularidades por planta.

### 6. 📁 Carga Masiva y Exportación Excel
- Descarga de plantillas oficiales en formato `.xlsx`.
- Importador nativo sin librerías externas que analiza y valida las hojas antes de aplicar cambios.
- Exportación del libro de control completo en Excel con un solo clic.

### 7. 🌓 Experiencia de Usuario y Tema
- Interfaz moderna en modo oscuro (*Dark Mode*) y modo claro (*Light Mode*).
- Diseño totalmente responsivo adaptable a monitores ejecutivos, portátiles y tabletas.

---

## 🛠️ Arquitectura Técnica

El proyecto ha sido concebido bajo principios de **cero dependencias de compilación externa (Vanilla ES Modules)** para máxima portabilidad, alta velocidad de carga y nulo mantenimiento de dependencias obsoletas:

```
CentroIndicadores/
├── index.html              # Estructura semántica HTML5
├── css/
│   └── styles.css          # Sistema de diseño con variables CSS, temas y micro-animaciones
├── js/
│   ├── app.js              # Controlador principal, navegación y gestión de eventos
│   ├── charts.js           # Motor de renderizado SVG para gráficos
│   ├── excel.js            # Motor nativo XLSX (ZipStore/DOMParser) y CSV
│   ├── icons.js            # Biblioteca de iconos vectoriales SVG
│   ├── state.js            # Modelo de datos, caché y persistencia en LocalStorage
│   └── utils.js            # Funciones auxiliares matemáticas, de formateo y validación
├── .env.example            # Plantilla de variables de entorno ficticias
├── .gitignore              # Reglas para control de versiones en GitHub
└── README.md               # Documentación integral del proyecto
```

---

## 🚀 Cómo Ejecutar el Proyecto Localmente

No necesitas instalar `Node.js`, `npm` ni herramientas de empaquetado complejas.

### Opción A: Servidor local de Python (Recomendado)
Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
python -m http.server 8080
```
Luego abre tu navegador en: [http://localhost:8080](http://localhost:8080)

### Opción B: Extensión Live Server de VS Code
1. Abre la carpeta del proyecto en Visual Studio Code.
2. Haz clic derecho sobre `index.html` y selecciona **"Open with Live Server"**.

---

## 🔒 Buenas Prácticas y Preparación para GitHub

- **Sin secretos**: La aplicación utiliza almacenamiento seguro local en el navegador (`localStorage`) y no contiene credenciales empresariales privadas.
- **Configuración de ejemplo**: Se incluye `.env.example` para documentar futuras integraciones con APIs o backends empresariales.
- **Ignorados protegidos**: El archivo `.gitignore` previene la subida accidental de archivos temporales del sistema operativo, logs o carpetas de configuración.

---

## 👥 Guía para Desarrolladores

Para agregar nuevos campos a los indicadores o métricas:
1. Revisa [js/state.js](file:///c:/Users/USUARIO/Music/CASA/CentroIndicadores/js/state.js) para ajustar el esquema en `baseCatalog()`.
2. Actualiza las cabeceras de exportación en [js/app.js](file:///c:/Users/USUARIO/Music/CASA/CentroIndicadores/js/app.js) (`exportAll`).
3. Modifica los estilos en [css/styles.css](file:///c:/Users/USUARIO/Music/CASA/CentroIndicadores/css/styles.css) utilizando las variables del `:root`.
