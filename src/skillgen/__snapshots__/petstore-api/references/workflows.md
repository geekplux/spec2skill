# Workflows

Chains where one call's output feeds the next call's input, strongest first. A step marked inferred matches by meaning, not by name: check the value before you rely on it. Each step names the output field and the input it fills, so you know where every required id comes from. `kit/chains.mjs` exports them as `chains`, with `nextSteps(id)` and `sources(id)` for single steps. Back to [SKILL.md](../SKILL.md).

## 1. `findPetsByStatus` -> `getPetById`

`findPetsByStatus` -> `getPetById` (`id -> petId`)

## 2. `findPetsByStatus` -> `updatePetWithForm`

`findPetsByStatus` -> `updatePetWithForm` (`id -> petId`)

## 3. `findPetsByStatus` -> `deletePet`

`findPetsByStatus` -> `deletePet` (`id -> petId`)

## 4. `findPetsByStatus` -> `uploadFile`

`findPetsByStatus` -> `uploadFile` (`id -> petId`)

