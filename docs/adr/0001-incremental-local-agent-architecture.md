# Incremental Local Agent Architecture for the Director Canvas MVP

Status: accepted

The MVP will upgrade the existing React/Vite + Express canvas incrementally instead of rebuilding around a new framework or cloud backend. The current project already has canvas nodes, groups, workflow JSON persistence, local media storage, image/video providers, chat, and storyboard routes, so the first director-workbench version will add a Director Domain layer, Graph Builder, Workflow Runner, Take Store, and Provider adapters beside the existing code while keeping old workflow files compatible. This chooses a local-agent style architecture for speed and creator privacy, while leaving SQLite, queues, ComfyUI, and SaaS storage as later migrations.
