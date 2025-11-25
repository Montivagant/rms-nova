release_name    = "nova-staging"
namespace       = "nova-staging"
image_registry  = "gcr.io"
image_tag       = "staging"
extra_values    = [
  "../helm/nova-stack/values-staging.yaml"
]
