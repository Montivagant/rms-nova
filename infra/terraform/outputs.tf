output "helm_release_name" {
  description = "Helm release name for the Nova stack."
  value       = module.nova_stack.release_name
}
