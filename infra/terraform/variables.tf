variable "kubeconfig_path" {
  description = "Path to the kubeconfig file."
  type        = string
  default     = "~/.kube/config"
}

variable "kubeconfig_context" {
  description = "Kubeconfig context to use."
  type        = string
  default     = ""
}

variable "release_name" {
  description = "Name of the Helm release."
  type        = string
  default     = "nova"
}

variable "namespace" {
  description = "Kubernetes namespace to deploy into."
  type        = string
  default     = "nova"
}

variable "chart_path" {
  description = "Relative or absolute path to the nova-stack Helm chart."
  type        = string
  default     = null
}

variable "image_registry" {
  description = "Registry to prepend to application images (overrides values.yaml global.imageRegistry)."
  type        = string
  default     = null
}

variable "image_tag" {
  description = "Image tag to deploy (overrides values.yaml global.imageTag)."
  type        = string
  default     = null
}

variable "extra_values" {
  description = "Paths to additional YAML snippets to merge into the Helm release."
  type        = list(string)
  default     = []
}

variable "create_namespace" {
  description = "Whether to ensure the namespace exists."
  type        = bool
  default     = true
}
