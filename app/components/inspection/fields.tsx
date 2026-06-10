'use client';

import { Checkbox, createListCollection, Field, NumberInput, Portal, RatingGroup, Select } from '@ark-ui/react';
import { useMemo } from 'react';
import { Controller, useFormContext, type FieldPath } from 'react-hook-form';

import type { FormValues } from './schema';

type FieldName = FieldPath<FormValues>;
type Option = { value: string; label: string };

const labelClass = 'text-sm text-muted';
const errorClass = 'text-xs text-danger';
const controlClass =
	'w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-foreground outline-none transition-colors focus:border-accent data-invalid:border-danger';

function useError(name: FieldName): string | undefined {
	const {
		formState: { errors },
	} = useFormContext<FormValues>();
	return (errors as Record<string, { message?: string } | undefined>)[name]?.message;
}

export function TextField({ name, label, placeholder }: { name: FieldName; label: string; placeholder?: string }) {
	const { register } = useFormContext<FormValues>();
	const error = useError(name);

	return (
		<Field.Root
			invalid={!!error}
			className='flex flex-col gap-1.5'
		>
			<Field.Label className={labelClass}>{label}</Field.Label>
			<Field.Input
				className={controlClass}
				placeholder={placeholder}
				{...register(name)}
			/>
			<Field.ErrorText className={errorClass}>{error}</Field.ErrorText>
		</Field.Root>
	);
}

export function TextareaField({
	name,
	label,
	placeholder,
	rows = 4,
}: {
	name: FieldName;
	label: string;
	placeholder?: string;
	rows?: number;
}) {
	const { register } = useFormContext<FormValues>();
	const error = useError(name);

	return (
		<Field.Root
			invalid={!!error}
			className='flex flex-col gap-1.5'
		>
			<Field.Label className={labelClass}>{label}</Field.Label>
			<Field.Textarea
				rows={rows}
				className={`${controlClass} resize-y`}
				placeholder={placeholder}
				{...register(name)}
			/>
			<Field.ErrorText className={errorClass}>{error}</Field.ErrorText>
		</Field.Root>
	);
}

export function NumberField({
	name,
	label,
	placeholder,
	min,
	max,
}: {
	name: FieldName;
	label: string;
	placeholder?: string;
	min?: number;
	max?: number;
}) {
	const { control } = useFormContext<FormValues>();

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field.Root
					invalid={!!fieldState.error}
					className='flex flex-col gap-1.5'
				>
					<Field.Label className={labelClass}>{label}</Field.Label>
					<NumberInput.Root
						min={min}
						max={max}
						invalid={!!fieldState.error}
						value={field.value === undefined || Number.isNaN(field.value) ? '' : String(field.value)}
						onValueChange={(details) => field.onChange(details.valueAsNumber)}
					>
						<NumberInput.Control className='flex items-stretch overflow-hidden rounded-md border border-border bg-surface-2 focus-within:border-accent data-invalid:border-danger'>
							<NumberInput.Input
								className='w-full bg-transparent px-3 py-2 text-foreground outline-none'
								placeholder={placeholder}
								onBlur={field.onBlur}
								ref={field.ref}
							/>
							<div className='flex flex-col border-l border-border'>
								<NumberInput.IncrementTrigger className='flex flex-1 items-center justify-center px-2 text-muted hover:bg-surface-3'>
									+
								</NumberInput.IncrementTrigger>
								<NumberInput.DecrementTrigger className='flex flex-1 items-center justify-center border-t border-border px-2 text-muted hover:bg-surface-3'>
									−
								</NumberInput.DecrementTrigger>
							</div>
						</NumberInput.Control>
					</NumberInput.Root>
					<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
				</Field.Root>
			)}
		/>
	);
}

export function SelectField({
	name,
	label,
	options,
	placeholder = 'Wybierz...',
}: {
	name: FieldName;
	label: string;
	options: Option[];
	placeholder?: string;
}) {
	const { control } = useFormContext<FormValues>();
	const collection = useMemo(() => createListCollection({ items: options }), [options]);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field.Root
					invalid={!!fieldState.error}
					className='flex flex-col gap-1.5'
				>
					<Field.Label className={labelClass}>{label}</Field.Label>
					<Select.Root
						collection={collection}
						invalid={!!fieldState.error}
						value={field.value ? [field.value as string] : []}
						onValueChange={(details) => field.onChange(details.value[0] ?? '')}
						positioning={{ sameWidth: true }}
					>
						<Select.Control>
							<Select.Trigger
								onBlur={field.onBlur}
								className={`${controlClass} flex items-center justify-between gap-2`}
							>
								<Select.ValueText placeholder={placeholder} />
								<Select.Indicator className='text-subtle'>▾</Select.Indicator>
							</Select.Trigger>
						</Select.Control>
						<Portal>
							<Select.Positioner>
								<Select.Content className='z-50 overflow-hidden rounded-md border border-border bg-surface-2 shadow-lg'>
									{options.map((option) => (
										<Select.Item
											key={option.value}
											item={option}
											className='flex cursor-pointer items-center justify-between px-3 py-2 text-foreground data-highlighted:bg-surface-3 data-[state=checked]:text-accent'
										>
											<Select.ItemText>{option.label}</Select.ItemText>
											<Select.ItemIndicator>✓</Select.ItemIndicator>
										</Select.Item>
									))}
								</Select.Content>
							</Select.Positioner>
						</Portal>
					</Select.Root>
					<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
				</Field.Root>
			)}
		/>
	);
}

type GroupedOption = { value: string; label: string; group: string };

export function MultiSelectField({
	name,
	label,
	options,
	placeholder = 'Wybierz...',
}: {
	name: FieldName;
	label: string;
	options: GroupedOption[];
	placeholder?: string;
}) {
	const { control } = useFormContext<FormValues>();
	const collection = useMemo(
		() => createListCollection({ items: options, groupBy: (item) => item.group }),
		[options],
	);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => {
				const selected = (field.value as string[] | undefined) ?? [];
				const selectedOptions = options.filter((option) => selected.includes(option.value));

				return (
					<Field.Root
						invalid={!!fieldState.error}
						className='flex flex-col gap-1.5'
					>
						<Field.Label className={labelClass}>{label}</Field.Label>
						<Select.Root
							multiple
							collection={collection}
							invalid={!!fieldState.error}
							value={selected}
							onValueChange={(details) => field.onChange(details.value)}
							positioning={{ sameWidth: true }}
						>
							<Select.Control>
								<Select.Trigger
									onBlur={field.onBlur}
									className={`${controlClass} flex items-center justify-between gap-2 text-left`}
								>
									{selectedOptions.length ? (
										<span className='flex flex-wrap gap-1.5'>
											{selectedOptions.map((option) => (
												<span
													key={option.value}
													className='rounded bg-surface-3 px-2 py-0.5 text-xs text-foreground'
												>
													{option.label}
												</span>
											))}
										</span>
									) : (
										<span className='text-subtle'>{placeholder}</span>
									)}
									<Select.Indicator className='shrink-0 text-subtle'>▾</Select.Indicator>
								</Select.Trigger>
							</Select.Control>
							<Portal>
								<Select.Positioner>
									<Select.Content className='z-50 max-h-72 overflow-y-auto rounded-md border border-border bg-surface-2 shadow-lg'>
										{collection.group().map(([group, items]) => (
											<Select.ItemGroup key={group}>
												<Select.ItemGroupLabel className='px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-subtle'>
													{group}
												</Select.ItemGroupLabel>
												{items.map((option) => (
													<Select.Item
														key={option.value}
														item={option}
														className='flex cursor-pointer items-center justify-between px-3 py-2 text-foreground data-highlighted:bg-surface-3 data-[state=checked]:text-accent'
													>
														<Select.ItemText>{option.label}</Select.ItemText>
														<Select.ItemIndicator>✓</Select.ItemIndicator>
													</Select.Item>
												))}
											</Select.ItemGroup>
										))}
									</Select.Content>
								</Select.Positioner>
							</Portal>
						</Select.Root>
						<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
					</Field.Root>
				);
			}}
		/>
	);
}

export function CheckboxField({ name, label }: { name: FieldName; label: string }) {
	const { control } = useFormContext<FormValues>();

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field.Root
					invalid={!!fieldState.error}
					className='flex flex-col gap-1.5'
				>
					<Checkbox.Root
						checked={!!field.value}
						onCheckedChange={(details) => field.onChange(details.checked === true)}
						invalid={!!fieldState.error}
						className='flex items-center gap-2'
					>
						<Checkbox.Control className='flex h-5 w-5 items-center justify-center rounded border border-border bg-surface-2 text-background data-[state=checked]:border-accent data-[state=checked]:bg-accent data-invalid:border-danger'>
							<Checkbox.Indicator>✓</Checkbox.Indicator>
						</Checkbox.Control>
						<Checkbox.Label className='text-sm text-foreground'>{label}</Checkbox.Label>
						<Checkbox.HiddenInput onBlur={field.onBlur} />
					</Checkbox.Root>
					<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
				</Field.Root>
			)}
		/>
	);
}

export function CheckboxGroupField({ name, label, options }: { name: FieldName; label: string; options: Option[] }) {
	const { control } = useFormContext<FormValues>();

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<div className='flex flex-col gap-2'>
					<span className={labelClass}>{label}</span>
					<Checkbox.Group
						value={(field.value as unknown as string[]) ?? []}
						onValueChange={field.onChange}
						onBlur={field.onBlur}
						invalid={!!fieldState.error}
						className='flex flex-col gap-2'
					>
						{options.map((option) => (
							<Checkbox.Root
								key={option.value}
								value={option.value}
								className='flex items-center gap-2'
							>
								<Checkbox.Control className='flex h-5 w-5 items-center justify-center rounded border border-border bg-surface-2 text-background data-[state=checked]:border-accent data-[state=checked]:bg-accent data-invalid:border-danger'>
									<Checkbox.Indicator>✓</Checkbox.Indicator>
								</Checkbox.Control>
								<Checkbox.Label className='text-sm text-foreground'>{option.label}</Checkbox.Label>
								<Checkbox.HiddenInput />
							</Checkbox.Root>
						))}
					</Checkbox.Group>
					{fieldState.error && <span className={errorClass}>{fieldState.error.message}</span>}
				</div>
			)}
		/>
	);
}

export function RatingField({ name, label, count = 5 }: { name: FieldName; label: string; count?: number }) {
	const { control } = useFormContext<FormValues>();

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field.Root
					invalid={!!fieldState.error}
					className='flex flex-col gap-1.5'
				>
					<Field.Label className={labelClass}>{label}</Field.Label>
					<RatingGroup.Root
						count={count}
						value={(field.value as number) ?? 0}
						onValueChange={(details) => field.onChange(details.value)}
						className='flex items-center gap-3'
					>
						<RatingGroup.Control className='flex gap-1'>
							<RatingGroup.Context>
								{(api) =>
									api.items.map((index) => (
										<RatingGroup.Item
											key={index}
											index={index}
											className='cursor-pointer text-4xl leading-none text-subtle data-highlighted:text-accent'
										>
											<RatingGroup.ItemContext>
												{(item) => (item.highlighted ? '●' : '○')}
											</RatingGroup.ItemContext>
										</RatingGroup.Item>
									))
								}
							</RatingGroup.Context>
						</RatingGroup.Control>
						<RatingGroup.Label className='font-mono text-sm text-muted'>
							{(field.value as number) ?? 0} / {count}
						</RatingGroup.Label>
						<RatingGroup.HiddenInput onBlur={field.onBlur} />
					</RatingGroup.Root>
					<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
				</Field.Root>
			)}
		/>
	);
}
