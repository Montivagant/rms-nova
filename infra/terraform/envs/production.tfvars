release_name    = "nova-production"
namespace       = "nova-production"
image_registry  = "gcr.io"
image_tag       = "production"
extra_values    = [
  "../helm/nova-stack/values-production.yaml"
]
